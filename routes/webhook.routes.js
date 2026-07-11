"use strict";
/**
 * routes/webhook.routes.js — mounted under /api/mock/webhook, behind the
 * same bearerAuth every other mock route uses.
 */

const { Router } = require("express");
const ctrl = require("../controllers/webhook.controller");

const router = Router();

router.post("/fire",                  ctrl.fireWebhook);
router.post("/simulate-out-of-order", ctrl.simulateOutOfOrder);
router.post("/schedule",              ctrl.scheduleWebhooks);
router.get ("/status",                ctrl.getWebhookLog);

module.exports = router;
