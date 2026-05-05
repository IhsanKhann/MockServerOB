"use strict";
/**
 * middleware/errorHandler.js — Global Express error handler
 */

const { fail } = require("../utils/response");

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] Unhandled on ${req.method} ${req.originalUrl}: ${err.message}`);
  console.error(err.stack);
  return fail(res, `Unexpected server error: ${err.message}`, 500);
};

module.exports = { errorHandler };