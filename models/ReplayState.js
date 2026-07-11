"use strict";
/**
 * models/ReplayState.js — Tier-2 REST fallback poller state.
 * Singleton document (_id: "default") tracking the last cursor consumed from
 * ERP Core's GET /api/sync/events, so a restart resumes instead of re-pulling
 * everything. See service/tier2Poller.service.js.
 */

const mongoose = require("mongoose");

const ReplayStateSchema = new mongoose.Schema(
  {
    _id:                 { type: String, default: "default" },
    cursor:              { type: String, default: null },
    enabled:             { type: Boolean, default: false },
    lastPolledAt:        { type: Date, default: null },
    lastPollStatus:      { type: String, enum: ["ok", "error"], default: null },
    lastPollError:       { type: String, default: null },
    totalEventsReceived: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReplayState", ReplayStateSchema);
