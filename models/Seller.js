"use strict";
/**
 * models/Seller.js — Backend B Seller model
 *
 * This is the SOURCE OF TRUTH in the mock business system.
 * Backend A syncs from here and propagates lifecycle changes back.
 */

const mongoose = require("mongoose");
const { Schema } = mongoose;

const AuditEntrySchema = new Schema(
  {
    action:    { type: String, required: true },          // approve | reject | suspend | block | terminate
    actorId:   { type: String, default: "system" },       // admin ID or "system"
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
    cnic:            { type: String,  default: null },      // encrypt at rest in production
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

const SellerSchema = new Schema(
  {
    // PHP-side fields (what Backend A reads)
    businessSellerId: { type: Number, required: true, unique: true, index: true },
    f_name:           { type: String, required: true },
    l_name:           { type: String, required: true },
    email:            { type: String, default: null },
    phone:            { type: String, default: null },
    store_name:       { type: String, default: null },      // Backend A maps → storeName
    city:             { type: String, default: null },
    category:         { type: String, default: null },

    // Lifecycle
    status: {
      type:    String,
      enum:    ["pending", "approved", "rejected", "suspended", "blocked", "terminated"],
      default: "pending",
      index:   true,
    },
    statusReason:   { type: String, default: null },
    suspendedUntil: { type: Date,   default: null },        // set when status = suspended
    blockedUntil:   { type: Date,   default: null },        // set when status = blocked

    // Audit trail — every status change is appended
    auditTrail: { type: [AuditEntrySchema], default: [] },

    // Payment
    paymentInfo: { type: PaymentInfoSchema, default: () => ({}) },

    // Metadata
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

SellerSchema.index({ businessSellerId: 1, status: 1 });

// Virtual: full name (matches what Backend A expects to build from f_name + l_name)
SellerSchema.virtual("name").get(function () {
  return `${this.f_name ?? ""} ${this.l_name ?? ""}`.trim();
});

SellerSchema.set("toJSON", { virtuals: true });
SellerSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Seller", SellerSchema);