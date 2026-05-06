// backendB/models/Seller.js
// ─────────────────────────────────────────────────────────────────────────────
// SOURCE OF TRUTH — Backend B (PHP-facing Node layer / Mongoose mirror)
//
// RULES:
//  • Only identity + contact + paymentInfo + status + timestamps
//  • NO financial tracking (totalOrders, balance, etc.) — those live in Backend A
//  • NO auditTrail — Backend A owns lifecycle history
//  • "blocked" is NOT a valid status here; it maps to "suspended" at the
//    normalizer layer (see backendA/services/normalizer.js)
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

// ── PaymentInfo ───────────────────────────────────────────────────────────────
// Flat structure — no nesting.  All fields nullable so the normalizer
// can safely fall back to null without throwing.
const PaymentInfoSchema = new mongoose.Schema(
  {
    iban:            { type: String,  default: null },
    accountTitle:    { type: String,  default: null },
    bankName:        { type: String,  default: null },
    branchCode:      { type: String,  default: null },
    swiftCode:       { type: String,  default: null },
    cnic:            { type: String,  default: null },
    easypaisa:       { type: String,  default: null },
    jazzCash:        { type: String,  default: null },
    kycVerified:     { type: Boolean, default: false },
    isInternational: { type: Boolean, default: false },
    preferredMethod: {
      type:    String,
      enum:    ["iban", "easypaisa", "jazzCash", "swift", "payoneer", "internal"],
      default: "iban",
    },
  },
  { _id: false }
);

// ── Seller ────────────────────────────────────────────────────────────────────
const SellerSchema = new mongoose.Schema(
  {
    // External PHP id — single source of truth key
    businessSellerId: { type: Number, required: true, unique: true, index: true },

    // Identity
    name:      { type: String, default: null }, // "firstName lastName" — pre-joined
    email:     { type: String, default: null },
    phone:     { type: String, default: null },
    storeName: { type: String, default: null },
    city:      { type: String, default: null },
    category:  { type: String, default: null },

    // Lifecycle — Backend B stores the raw PHP status
    // "blocked" from PHP will be normalised to "suspended" by Backend A
    status: {
      type:    String,
      enum:    ["pending", "approved", "rejected", "suspended", "terminated", "blocked"],
      default: "pending",
    },
    statusReason:   { type: String, default: null },
    suspendedUntil: { type: Date,   default: null },

    // Payment / KYC
    paymentInfo: { type: PaymentInfoSchema, default: () => ({}) },

    // Metadata
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Seller", SellerSchema);