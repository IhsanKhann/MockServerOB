"use strict";
/**
 * controllers/buyer.controller.js
 * Read-only endpoints for Buyers on Backend B — mirrors seller/shipper
 * controllers' GET handlers. No create/lifecycle routes: Backend A's
 * buyer.service.js only ever calls all_buyers / single_buyer.
 */

const Buyer = require("../models/Buyer");
const { ok, fail } = require("../utils/response");

// ── GET /all_buyers ───────────────────────────────────────────────────────────
exports.getAllBuyers = async (req, res, next) => {
  try {
    const buyers = await Buyer.find({}).lean();
    console.log(`[BUYER] all_buyers — returning ${buyers.length} records`);
    return ok(res, buyers, `${buyers.length} buyer(s) returned`);
  } catch (e) {
    next(e);
  }
};

// ── GET /single_buyer/:id ─────────────────────────────────────────────────────
exports.getSingleBuyer = async (req, res, next) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    if (isNaN(id) || id <= 0)
      return fail(res, `Invalid buyer id: "${rawId}" — must be a positive integer`, 400);

    const buyer = await Buyer.findOne({ businessBuyerId: id }).lean();
    if (!buyer) return fail(res, `Buyer with id ${id} not found`, 404);

    console.log(`[BUYER] single_buyer id=${id} found`);
    return ok(res, buyer, "Buyer fetched successfully");
  } catch (e) {
    next(e);
  }
};
