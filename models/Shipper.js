// models/Shipper
const mongoose = require("mongoose");

const PaymentInfoSchema = new mongoose.Schema(
  {
    iban: String,
    accountTitle: String,
    bankName: String,
    branchCode: String,
    swiftCode: String,
    cnic: String,
    kycVerified: Boolean,
    isInternational: Boolean,
    preferredMethod: {
      type: String,
      enum: ["iban", "easypaisa", "jazzCash", "swift", "internal"],
      default: "iban",
    },
  },
  { _id: false }
);

const ShipperSchema = new mongoose.Schema(
  {
    businessShipperId: { type: Number, required: true, unique: true },
    name: String,
    email: String,
    phone: String,
    city: String,
    type: String,
    coverage: String,
    rating: Number,

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended", "terminated"],
      default: "pending",
    },

    statusReason: String,
    suspendedUntil: Date,

    paymentInfo: { type: PaymentInfoSchema, default: {} },

    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shipper", ShipperSchema);