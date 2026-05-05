// models/Seller.js
const mongoose = require("mongoose");

const PaymentInfoSchema = new mongoose.Schema(
  {
    iban: String,
    accountTitle: String,
    bankName: String,
    branchCode: String,
    swiftCode: String,
    cnic: String,
    easypaisa: String,
    jazzCash: String,
    kycVerified: Boolean,
    isInternational: Boolean,
    preferredMethod: {
      type: String,
      enum: ["iban", "easypaisa", "jazzCash", "swift", "payoneer", "internal"],
      default: "iban",
    },
  },
  { _id: false }
);

const SellerSchema = new mongoose.Schema(
  {
    businessSellerId: { type: Number, required: true, unique: true },
    name: String,
    email: String,
    phone: String,
    storeName: String,
    city: String,
    category: String,

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

module.exports = mongoose.model("Seller", SellerSchema);