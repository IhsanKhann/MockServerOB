"use strict";
/**
 * utils/response.js — Shared PHP/Laravel-style envelope helpers
 */

const ts = () => new Date().toISOString();

const ok = (res, data, message = "Success", statusCode = 200) =>
  res.status(statusCode).json({ success: true,  message, data, meta: { timestamp: ts() } });

const fail = (res, message, statusCode = 400, data = null) =>
  res.status(statusCode).json({ success: false, message, data, meta: { timestamp: ts() } });

module.exports = { ok, fail };