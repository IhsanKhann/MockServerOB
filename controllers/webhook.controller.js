"use strict";
/**
 * controllers/webhook.controller.js — control surface for the outbound
 * webhook simulator (service/webhookSimulator.service.js). Mounted under
 * /api/mock/webhook, behind the same bearerAuth every other mock route
 * uses; never behind fault injection (see server.js).
 */

const { ok, fail } = require("../utils/response");
const simulator = require("../service/webhookSimulator.service");
const WebhookSimLog = require("../models/WebhookSimLog");

// POST /fire — body: { event, data, requestId? }
const fireWebhook = async (req, res) => {
  const { event, data, requestId } = req.body ?? {};
  if (!event) return fail(res, "event is required", 400);

  try {
    const result = await simulator.fireEvent({ event, data: data ?? {}, requestId });
    return ok(res, result, result.ok ? "Webhook fired" : "Webhook fired but ERP rejected it");
  } catch (err) {
    return fail(res, `Webhook fire failed: ${err.message}`, 502);
  }
};

// POST /simulate-out-of-order — body: { events: [{event, data}, ...] }
// Fires exactly the sequence given — pass the "correct" sequence reversed
// (or shuffled) yourself; see docs/SCENARIOS.md #5.
const simulateOutOfOrder = async (req, res) => {
  const { events } = req.body ?? {};
  if (!Array.isArray(events) || events.length === 0)
    return fail(res, "events must be a non-empty array of { event, data }", 400);

  try {
    const result = await simulator.fireSequence(events);
    return ok(res, result, `Fired ${events.length} event(s) in the given order`);
  } catch (err) {
    return fail(res, `Sequence fire failed: ${err.message}`, 502);
  }
};

// POST /schedule — body: { events: [{event, data}, ...], intervalMs }
// Returns immediately; fires happen asynchronously, spaced by intervalMs.
const scheduleWebhooks = (req, res) => {
  const { events, intervalMs } = req.body ?? {};
  if (!Array.isArray(events) || events.length === 0)
    return fail(res, "events must be a non-empty array of { event, data }", 400);

  const interval = Number(intervalMs);
  if (!Number.isFinite(interval) || interval < 0)
    return fail(res, "intervalMs must be a non-negative number", 400);

  const result = simulator.scheduleEvents(events, interval);
  return ok(res, result, `Scheduled ${events.length} event(s), ${interval}ms apart`, 202);
};

// GET /status — recent fire log, optionally filtered by batchId
const getWebhookLog = async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const filter = req.query.batchId ? { batchId: req.query.batchId } : {};
  const log = await WebhookSimLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return ok(res, log);
};

module.exports = { fireWebhook, simulateOutOfOrder, scheduleWebhooks, getWebhookLog };
