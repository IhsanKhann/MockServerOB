// backendB/models/Buyer.js
// ─────────────────────────────────────────────────────────────────────────────
// SOURCE OF TRUTH — Backend B (PHP-facing Node layer / Mongoose mirror)
// Mirrors Seller.js / Shipper.js. Buyers are read-only from Backend A's
// perspective (no lifecycle actions are called against this resource today —
// see services/biz/buyer.service.js, which only calls all_buyers/single_buyer).
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

const BuyerSchema = new mongoose.Schema(
  {
    // External PHP id — single source of truth key
    businessBuyerId: { type: Number, required: true, unique: true, index: true },

    // Identity — stored as f_name/l_name to match normalizeName()'s preferred
    // shape (services/normalizer.js), same convention as PHP's seller payload.
    f_name: { type: String, default: null },
    l_name: { type: String, default: null },
    email:  { type: String, default: null },
    phone:  { type: String, default: null },

    // Metadata
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Buyer", BuyerSchema);
