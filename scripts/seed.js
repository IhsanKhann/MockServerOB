"use strict";
/**
 * scripts/seed.js — one-shot seed of a handful of sellers/shippers/buyers
 * for exercising Backend A's sync pipeline against this mock. Idempotent:
 * upserts by the external id, safe to re-run.
 */

require("dotenv").config();

const { connectDB } = require("../config");
const Seller  = require("../models/Seller");
const Shipper = require("../models/Shipper");
const Buyer   = require("../models/Buyer");

const sellers = [
  { businessSellerId: 1, name: "Acme Store",   email: "acme@example.com",   phone: "0300-1000001", storeName: "Acme",   city: "Lahore",   category: "electronics", status: "approved" },
  { businessSellerId: 2, name: "Blue Bazaar",  email: "blue@example.com",   phone: "0300-1000002", storeName: "Blue",   city: "Karachi",  category: "apparel",     status: "approved" },
];

const shippers = [
  { businessShipperId: 1, name: "Fast Ship",   email: "fast@example.com",  phone: "0311-2000001", city: "Karachi", type: "offerberries", coverage: "national", rating: 4.5, status: "approved" },
  { businessShipperId: 2, name: "Quick Cargo", email: "quick@example.com", phone: "0311-2000002", city: "Lahore",  type: "external",      coverage: "regional", rating: 4.0, status: "approved" },
];

const buyers = [
  { businessBuyerId: 1, f_name: "Ali",  l_name: "Raza",  email: "ali@example.com",  phone: "0300-3000001" },
  { businessBuyerId: 2, f_name: "Sana", l_name: "Khan",  email: "sana@example.com", phone: "0300-3000002" },
];

(async () => {
  await connectDB();

  for (const s of sellers)
    await Seller.findOneAndUpdate({ businessSellerId: s.businessSellerId }, s, { upsert: true, returnDocument: "after" });
  for (const s of shippers)
    await Shipper.findOneAndUpdate({ businessShipperId: s.businessShipperId }, s, { upsert: true, returnDocument: "after" });
  for (const b of buyers)
    await Buyer.findOneAndUpdate({ businessBuyerId: b.businessBuyerId }, b, { upsert: true, returnDocument: "after" });

  console.log(`[SEED] ${sellers.length} sellers, ${shippers.length} shippers, ${buyers.length} buyers seeded/updated.`);
  process.exit(0);
})();
