// backendB/models/Shipper.js
// ─────────────────────────────────────────────────────────────────────────────
// SOURCE OF TRUTH — Backend B (PHP-facing Node layer / Mongoose mirror)
//
// RULES:
//  • Only identity + contact + paymentInfo + status + timestamps
//  • NO financial tracking — Backend A owns payable/earned tracking
//  • "blocked" maps to "suspended" in the normalizer layer
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

const PaymentInfoSchema = new mongoose.Schema(
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

const ShipperSchema = new mongoose.Schema(
  {
    businessShipperId: { type: Number, required: true, unique: true, index: true },

    name:     { type: String, default: null },
    email:    { type: String, default: null },
    phone:    { type: String, default: null },
    city:     { type: String, default: null },
    type:     { type: String, enum: ["offerberries", "external"], default: "external" },
    coverage: { type: String, default: null },
    rating:   { type: Number, default: 0 },

    status: {
      type:    String,
      enum:    ["pending", "approved", "rejected", "suspended", "terminated", "blocked"],
      default: "pending",
    },
    statusReason:   { type: String, default: null },
    suspendedUntil: { type: Date,   default: null },

    paymentInfo: { type: PaymentInfoSchema, default: () => ({}) },

    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shipper", ShipperSchema);