"use strict";
/**
 * controllers/seller.controller.js
 * CRUD + lifecycle for Sellers on Backend B
 */

const Seller = require("../models/Seller");
const { applyLifecycleAction, VALID_ACTIONS } = require("../service/lifecycle.service");
const { ok, fail } = require("../utils/response");

// ── GET /all_sellers ──────────────────────────────────────────────────────────
exports.getAllSellers = async (req, res, next) => {
  try {
    const sellers = await Seller.find({}).lean({ virtuals: true });
    console.log(`[SELLER] all_sellers — returning ${sellers.length} records`);
    return ok(res, sellers, `${sellers.length} seller(s) returned`);
  } catch (e) {
    next(e);
  }
};

// ── GET /single_seller/:id ────────────────────────────────────────────────────
exports.getSingleSeller = async (req, res, next) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    if (isNaN(id) || id <= 0)
      return fail(res, `Invalid seller id: "${rawId}" — must be a positive integer`, 400);

    const seller = await Seller.findOne({ businessSellerId: id }).lean({ virtuals: true });
    if (!seller) return fail(res, `Seller with id ${id} not found`, 404);

    console.log(`[SELLER] single_seller id=${id} found`);
    return ok(res, seller, "Seller fetched successfully");
  } catch (e) {
    next(e);
  }
};

// ── POST /  (create seller) ───────────────────────────────────────────────────
exports.createSeller = async (req, res, next) => {
  try {
    const { businessSellerId, f_name, l_name, email, phone, store_name, city, category, paymentInfo } = req.body;

    if (!businessSellerId || !f_name || !l_name)
      return fail(res, "businessSellerId, f_name, and l_name are required", 400);

    const exists = await Seller.findOne({ businessSellerId });
    if (exists) return fail(res, `Seller with businessSellerId ${businessSellerId} already exists`, 409);

    const seller = await Seller.create({
      businessSellerId,
      f_name, l_name, email, phone, store_name, city, category,
      paymentInfo: paymentInfo ?? {},
    });

    console.log(`[SELLER] Created seller id=${businessSellerId} — ${f_name} ${l_name}`);
    return ok(res, seller.toJSON(), "Seller created successfully", 201);
  } catch (e) {
    next(e);
  }
};

// ── PATCH /:id/status  (lifecycle action) ─────────────────────────────────────
exports.updateSellerStatus = async (req, res, next) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    if (isNaN(id) || id <= 0)
      return fail(res, `Invalid seller id: "${rawId}" — must be a positive integer`, 400);

    const { status: action, reason, note, actorId, durationDays } = req.body ?? {};

    if (!action) return fail(res, "status (action) is required in request body", 400);
    if (!VALID_ACTIONS.has(action))
      return fail(res, `Unknown action "${action}". Valid: ${[...VALID_ACTIONS].join(", ")}`, 400);

    const seller = await applyLifecycleAction(Seller, id, action, { reason, note, actorId, durationDays });

    return ok(res, {
      id:             seller.businessSellerId,
      status:         seller.status,
      statusReason:   seller.statusReason,
      suspendedUntil: seller.suspendedUntil,
      blockedUntil:   seller.blockedUntil,
      appliedAt:      new Date().toISOString(),
    }, `Seller ${action}d successfully`);
  } catch (e) {
    if (e.statusCode) return fail(res, e.message, e.statusCode);
    next(e);
  }
};

// ── POST /:action/:sellerId  (Backend-A-compatible lifecycle action route) ────
exports.sellerActionCompat = async (req, res, next) => {
  const { action, sellerId } = req.params;
  const id = Number(sellerId);

  try {
    if (!VALID_ACTIONS.has(action))
      return fail(res, `Unknown action "${action}". Valid: ${[...VALID_ACTIONS].join(", ")}`, 400);

    if (isNaN(id) || id <= 0)
      return fail(res, `Invalid seller id: "${sellerId}" — must be a positive integer`, 400);

    const { reason, note, actorId, durationDays } = req.body ?? {};
    const seller = await applyLifecycleAction(Seller, id, action, { reason, note, actorId, durationDays });

    return ok(res, {
      sellerId:       seller.businessSellerId,
      action,
      storeName:      seller.store_name,
      status:         seller.status,
      suspendedUntil: seller.suspendedUntil,
      blockedUntil:   seller.blockedUntil,
      appliedAt:      new Date().toISOString(),
    }, `Seller ${action}d successfully`);
  } catch (e) {
    if (e.statusCode) return fail(res, e.message, e.statusCode);
    next(e);
  }
};