"use strict";
/**
 * service/webhookSimulator.service.js — fires simulated partner-initiated
 * webhooks at ERP Core's POST /api/sync/event, so Backend-offerB's inbound
 * event-handling path can be exercised without waiting for a real partner.
 *
 * Signing scheme mirrors tier2Poller.service.js exactly (same HMAC-SHA256
 * over the raw request body, same TIER2_INBOUND_API_KEY/SECRET credential —
 * this is the "inbound" B2BCredential ERP Core already issued for testing,
 * not a new auth mechanism). See docs/SCENARIOS.md for the fault scenarios
 * this is used to drive.
 */

const crypto = require("crypto");
const { randomUUID } = require("crypto");
const WebhookSimLog = require("../models/WebhookSimLog");

const sign = (body, secret) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");

const requireEnv = () => {
  const baseUrl = process.env.ERP_BASE_URL;
  const apiKey = process.env.TIER2_INBOUND_API_KEY;
  const secret = process.env.TIER2_INBOUND_API_SECRET;
  if (!baseUrl || !apiKey || !secret) {
    throw new Error(
      "[WebhookSimulator] ERP_BASE_URL / TIER2_INBOUND_API_KEY / TIER2_INBOUND_API_SECRET must all be set"
    );
  }
  return { baseUrl, apiKey, secret };
};

/**
 * Fires one event at ERP's POST /api/sync/event, using the exact
 * { event, requestId, timestamp, data } envelope ErpEventPublisher sends.
 * Always logs the outcome (success or failure) to WebhookSimLog before
 * returning/throwing, so a scenario run's history survives even if the
 * caller doesn't inspect the return value.
 */
async function fireEvent({ event, data = {}, requestId = null, batchId = null }) {
  const { baseUrl, apiKey, secret } = requireEnv();
  const finalRequestId = requestId ?? `mock-${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const body = JSON.stringify({ event, requestId: finalRequestId, timestamp, data });
  const signature = sign(body, secret);
  const url = new URL("/api/sync/event", baseUrl);

  let ok = false;
  let httpStatus = null;
  let error = null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-signature": signature,
        "x-timestamp": String(timestamp),
      },
      body,
    });
    httpStatus = res.status;
    const json = await res.json().catch(() => null);
    ok = res.ok && json?.success !== false;
    if (!ok) error = json?.message || json?.error?.message || `HTTP ${res.status}`;
  } catch (err) {
    error = `network error: ${err.message}`;
  }

  await WebhookSimLog.create({
    event, requestId: finalRequestId, data, targetUrl: url.toString(),
    ok, httpStatus, error, batchId,
  });

  console.log(
    `[WebhookSimulator] fired ${event} (requestId=${finalRequestId}) → ${ok ? "OK" : `FAILED (${error})`}`
  );

  return { event, requestId: finalRequestId, ok, httpStatus, error };
}

/**
 * Fires a sequence of events back-to-back, in exactly the array order given.
 * Callers deliberately construct the "wrong" order (see
 * controllers/webhook.controller.js's simulateOutOfOrder) — this function
 * doesn't reorder anything itself, it just fires fast enough that arrival
 * order at ERP is not guaranteed to match send order either.
 */
async function fireSequence(events, { batchId = randomUUID() } = {}) {
  const results = [];
  for (const evt of events) {
    results.push(await fireEvent({ ...evt, batchId }));
  }
  return { batchId, results };
}

/**
 * Fires events spaced by intervalMs, without blocking the caller — returns
 * immediately with a scheduled count; each fire (and its outcome) lands in
 * WebhookSimLog asynchronously. Simulates a partner delivering webhooks on
 * its own delayed/staggered schedule rather than all at once.
 */
function scheduleEvents(events, intervalMs, { batchId = randomUUID() } = {}) {
  events.forEach((evt, i) => {
    setTimeout(() => {
      fireEvent({ ...evt, batchId }).catch((err) =>
        console.error(`[WebhookSimulator] scheduled fire failed: ${err.message}`)
      );
    }, i * intervalMs);
  });
  return { batchId, scheduled: events.length, intervalMs };
}

module.exports = { fireEvent, fireSequence, scheduleEvents };
