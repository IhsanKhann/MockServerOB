"use strict";
/**
 * service/tier2Poller.service.js — client side of ERP Core's Tier-2 REST
 * fallback (GET /api/sync/events?since=<cursor>&limit=<n>).
 *
 * Signing scheme mirrors ERP's own b2bInboundAuth exactly (HMAC-SHA256 over
 * the request body, empty-object '{}' for a bodyless GET, a mandatory
 * x-timestamp, all sent as x-api-key/x-signature/x-timestamp) — this is the
 * SAME credential (TIER2_INBOUND_API_KEY/SECRET) ERP already issued as an
 * "inbound" B2BCredential for whatever tenant is being tested, not a new
 * auth mechanism.
 */

const crypto = require("crypto");
const ReplayState = require("../models/ReplayState");
const ReplayedEvent = require("../models/ReplayedEvent");

const STATE_ID = "default";
const EMPTY_BODY = "{}";

let timer = null;

const sign = (body, secret) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");

const getState = async () => {
  let state = await ReplayState.findById(STATE_ID);
  if (!state) state = await ReplayState.create({ _id: STATE_ID });
  return state;
};

/**
 * Pull one page of events since the last saved cursor. Advances the cursor
 * and persists every event seen (idempotent — cursor is unique, duplicate
 * inserts are ignored). Returns a summary for the caller (route handler or
 * the interval loop) to log/report.
 */
async function pollOnce() {
  const baseUrl = process.env.ERP_BASE_URL;
  const apiKey = process.env.TIER2_INBOUND_API_KEY;
  const secret = process.env.TIER2_INBOUND_API_SECRET;

  if (!baseUrl || !apiKey || !secret) {
    throw new Error(
      "[Tier2Poller] ERP_BASE_URL / TIER2_INBOUND_API_KEY / TIER2_INBOUND_API_SECRET must all be set"
    );
  }

  const state = await getState();
  const limit = Number(process.env.TIER2_POLL_LIMIT) || 50;

  const url = new URL("/api/sync/events", baseUrl);
  url.searchParams.set("limit", String(limit));
  if (state.cursor) url.searchParams.set("since", state.cursor);

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(EMPTY_BODY, secret);

  let res, body;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "x-signature": signature,
        "x-timestamp": timestamp,
        "Content-Type": "application/json",
      },
    });
    body = await res.json();
  } catch (err) {
    state.lastPolledAt = new Date();
    state.lastPollStatus = "error";
    state.lastPollError = `network error: ${err.message}`;
    await state.save();
    throw err;
  }

  if (!res.ok || body.success !== true) {
    state.lastPolledAt = new Date();
    state.lastPollStatus = "error";
    state.lastPollError = `HTTP ${res.status}: ${body?.error?.message ?? body?.message ?? "unknown error"}`;
    await state.save();
    return { fetched: 0, hasMore: false, cursor: state.cursor };
  }

  const { events = [], nextCursor = null, hasMore = false } = body.data ?? {};

  for (const evt of events) {
    await ReplayedEvent.updateOne(
      { cursor: evt.cursor },
      { $setOnInsert: evt },
      { upsert: true }
    );
  }

  state.cursor = nextCursor ?? state.cursor;
  state.lastPolledAt = new Date();
  state.lastPollStatus = "ok";
  state.lastPollError = null;
  state.totalEventsReceived += events.length;
  await state.save();

  console.log(
    `[Tier2Poller] fetched ${events.length} event(s), cursor=${state.cursor ?? "(none)"}, hasMore=${hasMore}`
  );

  return { fetched: events.length, hasMore, cursor: state.cursor };
}

/**
 * Keep polling while a page reports hasMore, so a burst of events drains
 * within one interval tick instead of trickling out one page per tick.
 */
async function drain() {
  let result = await pollOnce();
  while (result.hasMore) {
    result = await pollOnce();
  }
}

function start() {
  if (timer) return;
  const intervalMs = Number(process.env.TIER2_POLL_INTERVAL_MS) || 5000;
  console.log(`[Tier2Poller] started (interval: ${intervalMs}ms)`);
  timer = setInterval(() => {
    drain().catch((err) => console.error("[Tier2Poller] poll failed:", err.message));
  }, intervalMs);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Tier2Poller] stopped");
  }
}

async function reset() {
  await ReplayState.findByIdAndUpdate(
    STATE_ID,
    { $set: { cursor: null, lastPollStatus: null, lastPollError: null, totalEventsReceived: 0 } },
    { upsert: true }
  );
}

module.exports = { pollOnce, drain, start, stop, reset, getState };
