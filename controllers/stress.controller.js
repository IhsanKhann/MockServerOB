"use strict";
/**
 * controllers/stress.controller.js — bulk seed/reset for stress-testing
 * Backend-offerB's sync services against a realistic catalog size, per
 * docs/SCENARIOS.md #8. Mounted under /api/mock/stress, behind bearerAuth.
 *
 * Not fault-injected (see server.js) — seeding needs to succeed reliably so
 * a stress run starts from a known-good state; fault injection targets the
 * /api/v2/* sync surface itself, not the test setup that precedes it.
 */

const Seller  = require("../models/Seller");
const Shipper = require("../models/Shipper");
const Buyer   = require("../models/Buyer");
const { ok, fail } = require("../utils/response");

const CITIES = ["Lahore", "Karachi", "Islamabad", "Faisalabad", "Multan", "Peshawar", "Quetta"];
const CATEGORIES = ["electronics", "apparel", "grocery", "home", "beauty", "sports", "books"];
const SHIPPER_COVERAGE = ["national", "regional", "local"];

const MAX_PER_TYPE = 20000; // sanity ceiling — a typo in the body shouldn't OOM the box

// Highest existing external id for a model, so repeated seed calls append
// rather than colliding on the unique id field.
const nextIdStart = async (Model, idField) => {
  const top = await Model.findOne({}).sort({ [idField]: -1 }).select(idField).lean();
  return (top?.[idField] ?? 0) + 1;
};

function buildSellers(count, startId) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    docs.push({
      businessSellerId: id,
      name:      `Stress Seller ${id}`,
      email:     `stress-seller-${id}@example.com`,
      phone:     `0300-${String(id).padStart(7, "0")}`,
      storeName: `Store ${id}`,
      city:      CITIES[id % CITIES.length],
      category:  CATEGORIES[id % CATEGORIES.length],
      status:    "approved",
    });
  }
  return docs;
}

function buildShippers(count, startId) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    docs.push({
      businessShipperId: id,
      name:     `Stress Shipper ${id}`,
      email:    `stress-shipper-${id}@example.com`,
      phone:    `0311-${String(id).padStart(7, "0")}`,
      city:     CITIES[id % CITIES.length],
      type:     id % 3 === 0 ? "offerberries" : "external",
      coverage: SHIPPER_COVERAGE[id % SHIPPER_COVERAGE.length],
      rating:   Math.round((3 + Math.random() * 2) * 10) / 10,
      status:   "approved",
    });
  }
  return docs;
}

function buildBuyers(count, startId) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    docs.push({
      businessBuyerId: id,
      f_name: `Buyer${id}`,
      l_name: "Stress",
      email:  `stress-buyer-${id}@example.com`,
      phone:  `0300-${String(id).padStart(7, "0")}`,
    });
  }
  return docs;
}

// POST /seed — body: { sellers?: N, shippers?: N, buyers?: N }
const seed = async (req, res) => {
  const sellers  = Math.max(0, Number(req.body?.sellers)  || 0);
  const shippers = Math.max(0, Number(req.body?.shippers) || 0);
  const buyers   = Math.max(0, Number(req.body?.buyers)   || 0);

  if (sellers === 0 && shippers === 0 && buyers === 0)
    return fail(res, "At least one of sellers/shippers/buyers must be > 0", 400);
  if (sellers > MAX_PER_TYPE || shippers > MAX_PER_TYPE || buyers > MAX_PER_TYPE)
    return fail(res, `Each count must be <= ${MAX_PER_TYPE}`, 400);

  try {
    const results = {};

    if (sellers > 0) {
      const startId = await nextIdStart(Seller, "businessSellerId");
      const inserted = await Seller.insertMany(buildSellers(sellers, startId), { ordered: false });
      results.sellers = { inserted: inserted.length, idRange: [startId, startId + sellers - 1] };
    }
    if (shippers > 0) {
      const startId = await nextIdStart(Shipper, "businessShipperId");
      const inserted = await Shipper.insertMany(buildShippers(shippers, startId), { ordered: false });
      results.shippers = { inserted: inserted.length, idRange: [startId, startId + shippers - 1] };
    }
    if (buyers > 0) {
      const startId = await nextIdStart(Buyer, "businessBuyerId");
      const inserted = await Buyer.insertMany(buildBuyers(buyers, startId), { ordered: false });
      results.buyers = { inserted: inserted.length, idRange: [startId, startId + buyers - 1] };
    }

    console.log(`[Stress] seeded ${JSON.stringify(results)}`);
    return ok(res, results, "Stress seed complete", 201);
  } catch (err) {
    return fail(res, `Stress seed failed: ${err.message}`, 500);
  }
};

// POST /reset — body: { confirm: true }
// Wipes ALL sellers/shippers/buyers (stress-seeded or not) — requires an
// explicit confirm flag so a stray call can't silently empty the collections.
const reset = async (req, res) => {
  if (req.body?.confirm !== true)
    return fail(res, 'Refusing to reset without { "confirm": true } in the body', 400);

  const [s, sh, b] = await Promise.all([
    Seller.deleteMany({}),
    Shipper.deleteMany({}),
    Buyer.deleteMany({}),
  ]);

  const result = { sellersDeleted: s.deletedCount, shippersDeleted: sh.deletedCount, buyersDeleted: b.deletedCount };
  console.log(`[Stress] reset ${JSON.stringify(result)}`);
  return ok(res, result, "All seller/shipper/buyer data cleared");
};

// GET /counts — cheap sanity check before/after a stress run
const counts = async (req, res) => {
  const [sellers, shippers, buyers] = await Promise.all([
    Seller.countDocuments({}),
    Shipper.countDocuments({}),
    Buyer.countDocuments({}),
  ]);
  return ok(res, { sellers, shippers, buyers });
};

module.exports = { seed, reset, counts };
