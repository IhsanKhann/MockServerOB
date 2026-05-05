"use strict";
/**
 * middleware/bearerAuth.js — Bearer token validation
 * All routes mounted AFTER this middleware require a valid Bearer token.
 */

const { fail } = require("../utils/response");

const bearerAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const xApiKey    = req.headers["x-api-key"];

  if (!authHeader) {
    if (xApiKey) {
      console.warn(`[AUTH] ❌ 401 — x-api-key received but Bearer is required on ${req.method} ${req.originalUrl}`);
      return fail(res, "Unauthorized: x-api-key is not accepted — use Authorization: Bearer <token>", 401);
    }
    console.warn(`[AUTH] ❌ 401 — Authorization header missing on ${req.method} ${req.originalUrl}`);
    return fail(res, "Unauthorized: Authorization header is required", 401);
  }

  if (!authHeader.startsWith("Bearer ")) {
    console.warn(`[AUTH] ❌ 401 — Non-Bearer scheme on ${req.method} ${req.originalUrl}`);
    return fail(res, "Unauthorized: Use Authorization: Bearer <token>", 401);
  }

  const token = authHeader.slice(7).trim();
  const expected = process.env.PHP_PARTNER_API_KEY ?? "offer_berries_server_to_server_communication_key";

  if (!token || token === "undefined" || token === "null") {
    console.warn(`[AUTH] ❌ 401 — Empty/null Bearer token on ${req.method} ${req.originalUrl}`);
    return fail(res, "Unauthorized: Bearer token is missing or null", 401);
  }

  if (token !== expected) {
    console.warn(`[AUTH] ❌ 401 — Token mismatch on ${req.method} ${req.originalUrl}`);
    return fail(res, "Unauthorized: Invalid API key", 401);
  }

  console.log(`[AUTH] ✅ Auth passed — ${req.method} ${req.originalUrl}`);
  next();
};

module.exports = { bearerAuth };