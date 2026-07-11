# Simulated marketplace scenarios

Written before coding, per `backend/docs/STAGING_MIGRATION_AND_DEV_ENV_PLAN_2026-07-06.md`
Phase 2. Each scenario below maps to a concrete knob added to MockServerOB —
see `README.md` for exact env vars / endpoints. The goal is to give
Backend-offerB (ERP Core) something real to defend against besides a
happy-path stub: partner APIs are slow, partners fail requests, webhooks
arrive late or out of order, and credentials rotate mid-session.

## 1. Slow partner API

**What it simulates:** the real PHP/Laravel partner backend under load —
requests take longer than the happy-path stub ever did.

**Knob:** `FAULT_LATENCY_ENABLED=true`, `FAULT_LATENCY_MIN_MS`,
`FAULT_LATENCY_MAX_MS` — every `/api/v2/*` request sleeps a random duration
in that range before its handler runs.

**What to verify on the ERP side:** `services/b2b/integrationClient.js`'s
timeout/retry behavior actually triggers instead of hanging the request
thread; nothing downstream assumes a sub-100ms partner response.

## 2. Partner API returns intermittent 5xx / specific status codes

**What it simulates:** partner-side bugs, deploys, or capacity issues —
some fraction of requests fail outright.

**Knob:** `FAULT_ERROR_ENABLED=true`, `FAULT_ERROR_RATE` (0–1),
`FAULT_ERROR_STATUS` (comma-separated list, one picked at random per
injected failure, e.g. `500,502,503`).

**What to verify:** ERP's retry/backoff logic (`integrationClient.js`)
actually retries on 5xx, and that a sustained failure rate surfaces as a
degraded-state signal somewhere observable (logs/metrics), not a silent
swallow.

## 3. Partner API rate-limits (429)

**What it simulates:** the partner enforcing its own rate limit against
ERP's outbound calls.

**Knob:** same error-injection mechanism as #2, with
`FAULT_ERROR_STATUS=429`. Combine with a lower `FAULT_ERROR_RATE` (e.g.
0.05–0.1) to simulate occasional throttling rather than a hard outage.

**What to verify:** ERP backs off rather than hammering the endpoint; no
cascading failure if 429s cluster.

## 4. Seller batch sync with partial failures

**What it simulates:** `syncBuyerBatch`/seller-sync style bulk operations
where some records succeed and others fail validation or hit a duplicate
key — the batch as a whole should not abort or silently drop the failures.

**Knob:** combine error injection (#2) with the existing seller `create`
route — at a moderate `FAULT_ERROR_RATE` (e.g. 0.2), a batch of N creates
against `/api/v2/seller` will see a realistic mix of 201s and 5xxs.

**What to verify:** ERP's batch-sync caller reports per-record
success/failure rather than treating the whole batch as failed on the first
error (see `partySyncDualWrite.test.js`'s `skippedCount`/`newCount` pattern
in Backend-offerB for the shape this should produce).

## 5. Shipper/buyer webhook arrives out of order

**What it simulates:** network reordering or partner-side async dispatch —
`ORDER_SHIPPED` arriving before `ORDER_CONFIRMED` for the same order, or a
`SELLER_RESTORED` arriving before the `SELLER_SUSPENDED` it's supposed to
reverse.

**Knob:** `POST /api/mock/webhook/simulate-out-of-order` — fires a
predefined event sequence in reverse (or shuffled) order at ERP's
`POST /api/sync/event`.

**What to verify:** ERP's `eventBus` handlers are idempotent/order-tolerant
per event type, not implicitly assuming arrival order — this is exactly the
class of bug the FinanceGuard migration's `atomicTransition` closed for
status flips; webhook ordering is the same hazard at the ingestion edge.

## 6. Buyer created then immediately updated (race)

**What it simulates:** a partner-side create followed almost immediately by
an update to the same record — two webhook/sync calls landing close enough
together that a naive read-modify-write could interleave.

**Knob:** `POST /api/mock/webhook/fire` twice in quick succession (no
artificial delay) for the same `businessBuyerId`, second call carrying
updated fields.

**What to verify:** ERP's `Party` dual-write (`upsertPartyFromSync`) doesn't
end up with the create's stale data winning over the update, or vice versa
based on non-deterministic request arrival.

## 7. Partner auth key rotated mid-session

**What it simulates:** the partner rotating `PHP_PARTNER_API_KEY` (the
credential MockServerOB itself validates) or ERP rotating its own
`TIER2_INBOUND_API_KEY`/`SECRET` (the credential MockServerOB's Tier-2
poller and webhook simulator use to call *back into* ERP) without both
sides updating in lockstep.

**Knob:** manually change `PHP_PARTNER_API_KEY` in MockServerOB's `.env`
and restart, or change ERP's issued credential without updating MockServerOB's
`TIER2_INBOUND_API_KEY`/`SECRET` — no new tooling needed, this is a
configuration-drill scenario, not a code feature.

**What to verify:** both directions fail closed with a clear 401, not a
silent auth bypass or an unhandled exception; confirms
`services/b2b/b2bAuth.js`'s per-tenant credential model actually rejects a
stale/rotated key rather than caching a previously-valid one indefinitely.

## 8. Bulk seller/shipper/buyer volume (stress baseline)

**What it simulates:** a partner with a large existing catalog — sync logic
that works fine against 5 sellers in a unit test may behave differently
against 5,000 (N+1 queries, unbounded `.find({})`, memory pressure).

**Knob:** `POST /api/mock/stress/seed` with `{ sellers, shippers, buyers }`
counts, `POST /api/mock/stress/reset` to clear between runs.

**What to verify:** run Backend-offerB's existing
`backend/tests/load/b2bInbound.loadtest.js` against ERP once MockServerOB is
seeded at volume, confirm ERP's sync services stay within the load test's
p99/throughput thresholds rather than degrading linearly with catalog size.

---

## Deliberately out of scope for MockServerOB

- **Simulating ERP Core's own bugs** — MockServerOB simulates the partner
  side only; ERP-side correctness is Backend-offerB's own test suite's job.
- **Persistent/scheduled chaos ("randomly fail 5% of all traffic forever in
  the dev environment")** — fault injection defaults to `false`/off so
  `dev.offerberriesvo.com` stays usable day-to-day; scenarios are opt-in via
  env vars for deliberate test runs, not an ambient condition.
