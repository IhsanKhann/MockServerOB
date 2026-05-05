"use strict";
/**
 * controllers/shipper.controller.js
 * CRUD + lifecycle for Shippers on Backend B
 */

const Shipper = require("../models/Shipper");
const { applyLifecycleAction, VALID_ACTIONS } = require("../controllers/shipper.controller");
const { ok, fail } = require("../utils/response");

// ── GET /all_shippers ─────────────────────────────────────────────────────────
exports.getAllShippers = async (req, res, next) => {
  try {
    const shippers = await Shipper.find({}).lean();
    console.log(`[SHIPPER] all_shippers — returning ${shippers.length} records`);
    return ok(res, shippers, `${shippers.length} shipper(s) returned`);
  } catch (e) {
    next(e);
  }
};

// ── GET /single_shipper/:id ───────────────────────────────────────────────────
exports.getSingleShipper = async (req, res, next) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    if (isNaN(id) || id <= 0)
      return fail(res, `Invalid shipper id: "${rawId}" — must be a positive integer`, 400);

    const shipper = await Shipper.findOne({ businessShipperId: id }).lean();
    if (!shipper) return fail(res, `Shipper with id ${id} not found`, 404);

    console.log(`[SHIPPER] single_shipper id=${id} found`);
    return ok(res, shipper, "Shipper fetched successfully");
  } catch (e) {
    next(e);
  }
};

// ── POST /  (create shipper) ──────────────────────────────────────────────────
exports.createShipper = async (req, res, next) => {
  try {
    const { businessShipperId, name, email, phone, city, type, coverage, rating, bankDetails } = req.body;

    if (!businessShipperId || !name)
      return fail(res, "businessShipperId and name are required", 400);

    const exists = await Shipper.findOne({ businessShipperId });
    if (exists) return fail(res, `Shipper with businessShipperId ${businessShipperId} already exists`, 409);

    const shipper = await Shipper.create({
      businessShipperId, name, email, phone, city,
      type:        type     ?? "external",
      coverage:    coverage ?? null,
      rating:      rating   ?? 0,
      bankDetails: bankDetails ?? {},
    });

    console.log(`[SHIPPER] Created shipper id=${businessShipperId} — ${name}`);
    return ok(res, shipper.toJSON(), "Shipper created successfully", 201);
  } catch (e) {
    next(e);
  }
};

// ── PATCH /:id/status  (lifecycle action) ─────────────────────────────────────
exports.updateShipperStatus = async (req, res, next) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    if (isNaN(id) || id <= 0)
      return fail(res, `Invalid shipper id: "${rawId}" — must be a positive integer`, 400);

    const { status: action, reason, note, actorId, durationDays } = req.body ?? {};

    if (!action) return fail(res, "status (action) is required in request body", 400);
    if (!VALID_ACTIONS.has(action))
      return fail(res, `Unknown action "${action}". Valid: ${[...VALID_ACTIONS].join(", ")}`, 400);

    const shipper = await applyLifecycleAction(Shipper, id, action, { reason, note, actorId, durationDays });

    return ok(res, {
      id:             shipper.businessShipperId,
      status:         shipper.status,
      statusReason:   shipper.statusReason,
      suspendedUntil: shipper.suspendedUntil,
      blockedUntil:   shipper.blockedUntil,
      appliedAt:      new Date().toISOString(),
    }, `Shipper ${action}d successfully`);
  } catch (e) {
    if (e.statusCode) return fail(res, e.message, e.statusCode);
    next(e);
  }
};

// ── POST /:action/:shipperId  (Backend-A-compatible action route) ──────────────
exports.shipperActionCompat = async (req, res, next) => {
  const { action, shipperId } = req.params;
  const id = Number(shipperId);

  try {
    if (!VALID_ACTIONS.has(action))
      return fail(res, `Unknown action "${action}". Valid: ${[...VALID_ACTIONS].join(", ")}`, 400);

    if (isNaN(id) || id <= 0)
      return fail(res, `Invalid shipper id: "${shipperId}" — must be a positive integer`, 400);

    const { reason, note, actorId, durationDays } = req.body ?? {};
    const shipper = await applyLifecycleAction(Shipper, id, action, { reason, note, actorId, durationDays });

    return ok(res, {
      shipperId:      shipper.businessShipperId,
      action,
      shipperName:    shipper.name,
      status:         shipper.status,
      suspendedUntil: shipper.suspendedUntil,
      blockedUntil:   shipper.blockedUntil,
      appliedAt:      new Date().toISOString(),
    }, `Shipper ${action}d successfully`);
  } catch (e) {
    if (e.statusCode) return fail(res, e.message, e.statusCode);
    next(e);
  }
};