"use strict";
/**
 * services/lifecycle.service.js
 *
 * Full lifecycle state machine for Sellers and Shippers on Backend B.
 * Handles: approve, reject, suspend, block, terminate
 * Pushes an audit trail entry on every transition.
 */

const VALID_ACTIONS = new Set(["approve", "reject", "suspend", "block", "terminate"]);

/**
 * Apply a lifecycle action to a Mongoose document.
 *
 * @param {mongoose.Model}  Model       — Seller or Shipper
 * @param {number}          externalId  — businessSellerId / businessShipperId
 * @param {string}          action      — approve | reject | suspend | block | terminate
 * @param {object}          body        — { reason, note, actorId, durationDays }
 * @returns {mongoose.Document}         — updated document
 */
const applyLifecycleAction = async (Model, externalId, action, body = {}) => {
  const { reason = null, note = null, actorId = "system", durationDays = null } = body;

  if (!VALID_ACTIONS.has(action)) {
    const err = new Error(`Unknown action "${action}". Valid: ${[...VALID_ACTIONS].join(", ")}`);
    err.statusCode = 400;
    throw err;
  }

  // Determine the field used for the ID (differs between models)
  const idField = Model.modelName === "Seller" ? "businessSellerId" : "businessShipperId";
  const entity  = await Model.findOne({ [idField]: externalId });

  if (!entity) {
    const err = new Error(`${Model.modelName} with id ${externalId} not found`);
    err.statusCode = 404;
    throw err;
  }

  // ── State machine ────────────────────────────────────────────────────────
  switch (action) {
    case "approve":
      entity.status        = "approved";
      entity.statusReason  = null;
      entity.suspendedUntil = null;
      entity.blockedUntil   = null;
      break;

    case "reject":
      entity.status       = "rejected";
      entity.statusReason = reason ?? "No reason provided";
      break;

    case "suspend": {
      entity.status       = "suspended";
      entity.statusReason = reason ?? null;
      const days = Number(durationDays);
      if (days > 0) {
        const until = new Date();
        until.setDate(until.getDate() + days);
        entity.suspendedUntil = until;
      } else {
        entity.suspendedUntil = null; // indefinite suspension
      }
      break;
    }

    case "block": {
      entity.status       = "blocked";
      entity.statusReason = reason ?? null;
      const days = Number(durationDays);
      if (days > 0) {
        const until = new Date();
        until.setDate(until.getDate() + days);
        entity.blockedUntil = until;
      } else {
        entity.blockedUntil = null; // indefinite block
      }
      break;
    }

    case "terminate":
      entity.status       = "terminated";
      entity.statusReason = reason ?? "Terminated";
      break;
  }

  // ── Audit trail ───────────────────────────────────────────────────────────
  entity.auditTrail.push({
    action,
    actorId: actorId ?? "system",
    reason:  reason  ?? null,
    note:    note    ?? null,
    timestamp: new Date(),
  });

  entity.lastSyncedAt = new Date();
  await entity.save();

  console.log(`[LIFECYCLE] ${Model.modelName} id=${externalId} → ${action}d by actorId=${actorId}`);
  return entity;
};

module.exports = { applyLifecycleAction, VALID_ACTIONS };