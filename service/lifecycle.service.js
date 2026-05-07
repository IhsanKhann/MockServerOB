"use strict";

const VALID_ACTIONS = new Set([
  "approve",
  "reject",
  "suspend",
  "block",
  "terminate",
]);

const ACTION_TO_STATUS = {
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  block: "suspended",
  terminate: "terminated",
};

const applyLifecycleAction = async (
  Model,
  externalId,
  action,
  opts = {}
) => {
  if (!VALID_ACTIONS.has(action)) {
    const e = new Error(
      `Unknown action "${action}". Valid: ${[
        ...VALID_ACTIONS,
      ].join(", ")}`
    );
    e.statusCode = 400;
    throw e;
  }

  const idField =
    Model.modelName === "Seller"
      ? "businessSellerId"
      : "businessShipperId";

  const entity = await Model.findOne({
    [idField]: externalId,
  });

  if (!entity) {
    const e = new Error(
      `${Model.modelName} ${externalId} not found`
    );
    e.statusCode = 404;
    throw e;
  }

  const {
    reason,
    durationDays,
  } = opts;

  const newStatus = ACTION_TO_STATUS[action];

  let suspendedUntil = null;

  if (
    (action === "suspend" || action === "block") &&
    durationDays > 0
  ) {
    suspendedUntil = new Date(
      Date.now() +
      durationDays * 24 * 60 * 60 * 1000
    );
  }

  entity.status = newStatus;

  entity.statusReason =
    reason ??
    (action === "block"
      ? "blocked"
      : null);

  entity.suspendedUntil = suspendedUntil;

  entity.lastSyncedAt = new Date();

  await entity.save();

  console.log(
    `[lifecycle.service] ${Model.modelName} ${externalId}: ${newStatus} (${action})`
  );

  return entity;
};

const liftExpiredSuspensions = async (Model) => {
  const result = await Model.updateMany(
    {
      status: "suspended",
      suspendedUntil: { $lte: new Date() },
    },
    {
      $set: {
        status: "approved",
        statusReason: null,
        suspendedUntil: null,
        lastSyncedAt: new Date(),
      },
    }
  );

  console.log(
    `[lifecycle.service] liftExpiredSuspensions (${Model.modelName}): ${result.modifiedCount} lifted`
  );

  return result.modifiedCount;
};

module.exports = {
  applyLifecycleAction,
  liftExpiredSuspensions,
  VALID_ACTIONS,
};