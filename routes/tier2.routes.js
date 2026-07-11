"use strict";
/**
 * routes/tier2.routes.js — mounted under /api/mock/tier2, behind the same
 * bearerAuth every other mock route uses.
 */

const { Router } = require("express");
const { getStatus, listEvents, pollNow, resetState } = require("../controllers/tier2.controller");

const router = Router();

router.get("/status", getStatus);
router.get("/events", listEvents);
router.post("/poll-now", pollNow);
router.post("/reset", resetState);

module.exports = router;
