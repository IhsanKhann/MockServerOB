# MockServerOB

A mock of the external PHP/Laravel business system ("Backend B") that
Backend-offerB (ERP Core, "Backend A") syncs with — seller/shipper/buyer
CRUD, lifecycle actions, and B2B event delivery in both directions.

Used for both dev and pre-real-partner testing:
- **Development (Windows → GitHub → Linux):** push here, pull on the
  Hetzner box, containerize alongside `dev.offerberriesvo.com`'s backend,
  talk to it over the internal Docker network only — no port exposed
  publicly, no Cloudflare tunnel.
- **Pre-production:** exercise ERP Core's B2B integration logic against this
  before ever pointing it at the real Backend-B partner system.

## Auth model

`Authorization: Bearer <PHP_PARTNER_API_KEY>` on every route except
`GET /health` / `GET /api/health`. `x-api-key` is explicitly rejected (401)
to catch a caller using the wrong scheme early.

Response envelope everywhere: `{ success, message, data, meta: { timestamp } }`.

## Routes

| Mount | Purpose |
|---|---|
| `GET /health`, `GET /api/health` | Auth-exempt health check |
| `/api/v2/seller`, `/api/v2/shipper` | CRUD + lifecycle (`approve`/`reject`/`suspend`/`block`/`terminate`) — **fault-injected** |
| `/api/v2/buyer` | Read-only CRUD — **fault-injected** |
| `/api/mock/tier2` | Tier-2 REST-pull fallback poller control (status/events/poll-now/reset) |
| `/api/mock/webhook` | Outbound webhook simulator — see below |
| `/api/mock/stress` | Bulk seed/reset for stress testing — see below |
| `/api/mock/fault/status` | Read-only current fault-injection config |

`/api/mock/*` and `/api/mock/fault/status` are **never** fault-injected —
they're the control surface you need reachable to manage a chaos run that's
currently in progress against `/api/v2/*`.

## Fault injection

Simulates a real partner API being slow or unreliable, instead of the
happy-path stub every route was until this was added. See
`docs/SCENARIOS.md` for the concrete scenarios these knobs are meant to
drive and what to verify on the ERP side for each.

Both default to **disabled** — nothing changes for day-to-day dev use unless
you opt in.

```bash
# Slow partner API: every /api/v2/* call sleeps 200-2000ms first
FAULT_LATENCY_ENABLED=true
FAULT_LATENCY_MIN_MS=200
FAULT_LATENCY_MAX_MS=2000

# Partner API fails 20% of calls with a 500, 502, or 503 (picked at random)
FAULT_ERROR_ENABLED=true
FAULT_ERROR_RATE=0.2
FAULT_ERROR_STATUS=500,502,503
```

Check what's currently active: `GET /api/mock/fault/status` (no auth
bypass — still needs the Bearer token, just never itself fault-injected).

**Escape hatch:** any single request can skip fault injection entirely with
`x-mock-bypass-fault: true` — use this from setup/seed calls that need a
reliable write path regardless of the current chaos config.

Changing these requires restarting the process (they're read from
`process.env` on every request, but `.env` itself is only loaded at boot) —
edit `.env` and restart, or export them in the shell before `npm start` for
a one-off run.

## Outbound webhook simulator

Fires a signed `POST {ERP_BASE_URL}/api/sync/event` — the exact envelope
`ErpEventPublisher` sends (`{ event, requestId, timestamp, data }`), signed
with the same HMAC-SHA256 scheme `service/tier2Poller.service.js` already
uses (`TIER2_INBOUND_API_KEY`/`TIER2_INBOUND_API_SECRET` — the "inbound"
B2BCredential ERP Core issues for testing, not a separate mechanism). Lets
you exercise ERP's inbound event-handling path without waiting for a real
partner callback.

```bash
# Fire one event
POST /api/mock/webhook/fire
{ "event": "ORDER_PAID", "data": { "orderId": "ORD-123", "orderAmount": 5000 } }

# Fire a sequence in exactly the order given — construct the "wrong" order
# yourself to simulate reordering (docs/SCENARIOS.md #5)
POST /api/mock/webhook/simulate-out-of-order
{ "events": [
    { "event": "ORDER_SHIPPED",   "data": { "orderId": "ORD-123" } },
    { "event": "ORDER_CONFIRMED", "data": { "orderId": "ORD-123" } }
] }

# Fire events spaced apart — returns immediately, fires happen async
POST /api/mock/webhook/schedule
{ "events": [ ... ], "intervalMs": 3000 }

# Inspect fire history (optionally filter by batchId from the two calls above)
GET /api/mock/webhook/status?limit=50&batchId=<uuid>
```

Every attempt — success or failure — is logged to `WebhookSimLog`
(MongoDB) before the call returns, so a scenario run's history survives
even if you don't capture the HTTP response.

Requires `ERP_BASE_URL`, `TIER2_INBOUND_API_KEY`, `TIER2_INBOUND_API_SECRET`
to be set (same vars the Tier-2 poller uses).

## Bulk seed / stress testing

```bash
# Generate N of each — ids auto-continue from the current max, so repeated
# calls append rather than colliding on the unique external-id field
POST /api/mock/stress/seed
{ "sellers": 500, "shippers": 100, "buyers": 1000 }

# Sanity-check current volume
GET /api/mock/stress/counts

# Wipe ALL sellers/shippers/buyers (stress-seeded or not) — requires the
# explicit confirm flag so a stray call can't empty the collections
POST /api/mock/stress/reset
{ "confirm": true }
```

Each count is capped at 20,000 per call (a typo in the request body
shouldn't be able to OOM the box). To actually load-test ERP's sync
services against this seeded volume, run Backend-offerB's existing
`backend/tests/load/b2bInbound.loadtest.js` against ERP once MockServerOB
is seeded — that script targets ERP's `POST /api/sync/event`, not this
server; MockServerOB's job here is just to have enough realistic catalog
data for ERP's sync logic to actually work against.

### Why there's no `docker-compose.stress.yml`

Considered and decided against, for now. This server is lightweight — one
Express process + a Mongoose client to remote Atlas — so a stress run
against it is dominated by network/DB I/O, not host CPU/memory. The actual
resource-contention risk the staging/dev-env plan flagged is the *shared
Hetzner box* running `dev.offerberriesvo.com` + demo-platform + an unrelated
marketing-agent stack all at once — a separate compose *file* on that same
box doesn't fix host-level contention, since Docker's still scheduling all
those containers onto the same 2 vCPU / 3.7GB.

If you need a stress run isolated from the shared box:
- **Preferred:** use this repo's own standalone `docker-compose.yml` (own
  local `mongo:7` container, no Atlas, no Hetzner) and point
  `LOAD_TARGET_URL`/`ERP_BASE_URL` at wherever you're running ERP Core
  locally for the test.
- If you must test against the real `dev` stack, keep seed counts modest
  and coordinate timing — the dev backend, MockServerOB, and Grafana all
  compete for the same box today (see
  `backend/docs/STAGING_MIGRATION_AND_DEV_ENV_PLAN_2026-07-06.md` Phase 0/1).
- Revisit this decision if/when the dev stack gets dedicated stress-test
  infra — at that point the right fix is `mem_limit`/`cpus` on this
  container (matching the Phase 0 pattern already applied to
  `docker-compose.dev.yml`/`docker-compose.prod.yml`), not a new compose
  file.

## Scenarios this is built to simulate

See `docs/SCENARIOS.md` for the full list (slow partner API, intermittent
5xx/429, partial-failure batch sync, out-of-order/racing webhooks, credential
rotation, bulk-volume sync) and what each is meant to verify on ERP Core's
side.

## Tier-2 REST-pull fallback

`service/tier2Poller.service.js` polls ERP Core's `GET /api/sync/events` on
an interval as a fallback delivery path (in case the primary
webhook-push/event-emit path misses something). Enable with
`TIER2_POLL_ENABLED=true`; inspect via `GET /api/mock/tier2/status`,
`GET /api/mock/tier2/events`; force an immediate poll with
`POST /api/mock/tier2/poll-now`; reset the cursor with
`POST /api/mock/tier2/reset`.
