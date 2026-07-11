"use strict";
/**
 * models/ReplayedEvent.js — every event pulled via the Tier-2 REST fallback
 * poller, kept for test inspection (GET /api/mock/tier2/events).
 */

const mongoose = require("mongoose");

const ReplayedEventSchema = new mongoose.Schema(
  {
    cursor:    { type: String, required: true, unique: true, index: true },
    event:     { type: String, required: true },
    requestId: { type: String, default: null },
    status:    { type: String, default: null },
    timestamp: { type: String, default: null },
    data:      { type: mongoose.Schema.Types.Mixed, default: {} },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReplayedEvent", ReplayedEventSchema);
