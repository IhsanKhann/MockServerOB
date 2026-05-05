"use strict";
/**
 * models/Shipper.js — Backend B Shipper model
 */

const mongoose = require("mongoose");
const { Schema } = mongoose;

const AuditEntrySchema = new Schema(
  {
    action:    { type: String, required: true },
    actorId:   { type: String, default: "system" },
    reason:    { type: String, default: null },
    note:      { type: String, default: null },
    timestamp: { type: Date,   default: Date.now },
  },
  { _id: false }
);

const PaymentInfoSchema = new Schema(
  {
    iban:            { type: String,  default: null },
    accountTitle:    { type: String,  default: null },
    bankName:        { type: String,  default: null },
    branchCode:      { type: String,  default: null },
    swiftCode:       { type: String,  default: null },
    cnic:            { type: String,  default: null },
    kycVerified:     { type: Boolean, default: false },
    isInternational: { type: Boolean, default: false },
    preferredMethod: {
      type:    String,
      enum:    ["iban", "easypaisa", "jazzCash", "swift", "internal"],
      default: "iban",
    },
  },
  { _id: false }
);

const ShipperSchema = new Schema(
  {
    // PHP-side fields
    businessShipperId: { type: Number, required: true, unique: true, index: true },
    name:              { type: String, required: true },
    email:             { type: String, default: null },
    phone:             { type: String, default: null },
    city:              { type: String, default: null },
    type:              { type: String, enum: ["offerberries", "external"], default: "external" },
    coverage:          { type: String, default: null },
    rating:            { type: Number, default: 0, min: 0, max: 5 },

    // Lifecycle
    status: {
      type:    String,
      enum:    ["pending", "approved", "rejected", "suspended", "blocked", "terminated"],
      default: "pending",
      index:   true,
    },
    statusReason:   { type: String, default: null },
    suspendedUntil: { type: Date,   default: null },
    blockedUntil:   { type: Date,   default: null },

    // Audit trail
    auditTrail: { type: [AuditEntrySchema], default: [] },

    // Payment / bank details (Backend A reads bankDetails key)
    bankDetails: { type: PaymentInfoSchema, default: () => ({}) },

    // Metadata
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

ShipperSchema.index({ businessShipperId: 1, status: 1 });

module.exports = mongoose.model("Shipper", ShipperSchema);