"use strict";
/**
 * models/WebhookSimLog.js — record of every outbound webhook the simulator
 * fired at ERP Core's POST /api/sync/event, for inspection via
 * GET /api/mock/webhook/status during a scenario run.
 */

const mongoose = require("mongoose");

const WebhookSimLogSchema = new mongoose.Schema(
  {
    event:      { type: String, required: true },
    requestId:  { type: String, required: true },
    data:       { type: mongoose.Schema.Types.Mixed, default: {} },
    targetUrl:  { type: String, required: true },
    ok:         { type: Boolean, required: true },
    httpStatus: { type: Number, default: null },
    error:      { type: String, default: null },
    // Set when this fire was part of a batch (out-of-order / scheduled) so
    // the log can be filtered per scenario run.
    batchId:    { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WebhookSimLog", WebhookSimLogSchema);
