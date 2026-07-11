"use strict";
/**
 * middleware/faultInjection.js — env-driven latency + error injection.
 *
 * Mounted only on /api/v2/* (seller/shipper/buyer) — never on /health or the
 * /api/mock/* control surfaces (tier2 poller, webhook simulator, stress
 * seeding), so those stay reachable to diagnose/manage a fault-injection run
 * that's currently in progress. A request can opt out entirely with
 * `x-mock-bypass-fault: true` (used by seed/setup scripts that need a clean
 * write path regardless of the current fault config).
 *
 * Both knobs read process.env on every request (not cached at boot) so a
 * fault-injection run can be started/stopped by editing .env + restarting,
 * or — since these are plain env reads — by any process-level env mutation
 * a test harness performs before making its next call.
 *
 * Defaults are OFF. dev.offerberriesvo.com stays usable day-to-day; fault
 * injection is opt-in for a deliberate test run (see docs/SCENARIOS.md).
 */

const { fail } = require("../utils/response");

const isEnabled = (v) => v === "true" || v === "1";

const bypassed = (req) => req.headers["x-mock-bypass-fault"] === "true";

// ── Latency injection ───────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const latencyInjection = async (req, res, next) => {
  if (bypassed(req) || !isEnabled(process.env.FAULT_LATENCY_ENABLED)) return next();

  const min = Math.max(0, Number(process.env.FAULT_LATENCY_MIN_MS) || 0);
  const max = Math.max(min, Number(process.env.FAULT_LATENCY_MAX_MS) || min);
  const delayMs = min + Math.floor(Math.random() * (max - min + 1));

  console.log(`[FaultInjection] latency: delaying ${req.method} ${req.originalUrl} by ${delayMs}ms`);
  await sleep(delayMs);
  next();
};

// ── Error injection ─────────────────────────────────────────────────────────
const parseStatusList = (raw) => {
  const codes = String(raw ?? "500")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 400 && n < 600);
  return codes.length ? codes : [500];
};

const errorInjection = (req, res, next) => {
  if (bypassed(req) || !isEnabled(process.env.FAULT_ERROR_ENABLED)) return next();

  const rate = Math.min(1, Math.max(0, Number(process.env.FAULT_ERROR_RATE) || 0));
  if (Math.random() >= rate) return next();

  const statusList = parseStatusList(process.env.FAULT_ERROR_STATUS);
  const status = statusList[Math.floor(Math.random() * statusList.length)];

  console.log(`[FaultInjection] error: injecting ${status} on ${req.method} ${req.originalUrl}`);
  return fail(res, `[FaultInjection] simulated ${status} response`, status);
};

// ── Inspection endpoint (read-only — see /api/mock/fault/status) ───────────
const getFaultStatus = (req, res) => {
  const { ok } = require("../utils/response");
  return ok(res, {
    latency: {
      enabled: isEnabled(process.env.FAULT_LATENCY_ENABLED),
      minMs:   Number(process.env.FAULT_LATENCY_MIN_MS) || 0,
      maxMs:   Number(process.env.FAULT_LATENCY_MAX_MS) || 0,
    },
    error: {
      enabled:    isEnabled(process.env.FAULT_ERROR_ENABLED),
      rate:       Number(process.env.FAULT_ERROR_RATE) || 0,
      statusList: parseStatusList(process.env.FAULT_ERROR_STATUS),
    },
    bypassHeader: "x-mock-bypass-fault: true",
  }, "Current fault-injection config (env-driven, read-only)");
};

module.exports = { latencyInjection, errorInjection, getFaultStatus };
