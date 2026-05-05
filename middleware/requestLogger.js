"use strict";
/**
 * middleware/requestLogger.js — Structured request/response logging
 */

const requestLogger = (req, res, next) => {
  const start = Date.now();
  const ts    = () => new Date().toISOString();

  const authHeader = req.headers["authorization"] ?? null;
  let tokenStatus;
  if (authHeader?.startsWith("Bearer "))   tokenStatus = "✅ Bearer present";
  else if (authHeader)                     tokenStatus = `⚠️  Non-Bearer: "${authHeader.slice(0,20)}..."`;
  else if (req.headers["x-api-key"])       tokenStatus = "❌ x-api-key (will 401)";
  else                                     tokenStatus = "❌ No auth header";

  console.log(`[REQ]  [${ts()}] → ${req.method} ${req.originalUrl}`);
  console.log(`[REQ]  Token: ${tokenStatus}`);

  const bodyKeys = Object.keys(req.body ?? {});
  if (bodyKeys.length > 0) {
    console.log(`[REQ]  Body: ${JSON.stringify(req.body)}`);
  }

  const orig = res.json.bind(res);
  res.json = (payload) => {
    const ms = Date.now() - start;
    console.log(`[RES]  [${ts()}] ← ${req.method} ${req.originalUrl} → HTTP ${res.statusCode} (${ms}ms)`);
    return orig(payload);
  };

  next();
};

module.exports = { requestLogger };