"use strict";
/**
 * controllers/tier2.controller.js — inspection/control surface for the
 * Tier-2 REST fallback poller, for use during Backend-A integration testing.
 */

const { ok, fail } = require("../utils/response");
const poller = require("../service/tier2Poller.service");
const ReplayedEvent = require("../models/ReplayedEvent");

const getStatus = async (req, res) => {
  const state = await poller.getState();
  return ok(res, {
    cursor: state.cursor,
    lastPolledAt: state.lastPolledAt,
    lastPollStatus: state.lastPollStatus,
    lastPollError: state.lastPollError,
    totalEventsReceived: state.totalEventsReceived,
  });
};

const listEvents = async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const events = await ReplayedEvent.find({}).sort({ receivedAt: -1 }).limit(limit).lean();
  return ok(res, events);
};

const pollNow = async (req, res) => {
  try {
    const result = await poller.pollOnce();
    return ok(res, result);
  } catch (err) {
    return fail(res, `Poll failed: ${err.message}`, 502);
  }
};

const resetState = async (req, res) => {
  await poller.reset();
  return ok(res, { reset: true });
};

module.exports = { getStatus, listEvents, pollNow, resetState };
