"use strict";
/**
 * routes/stress.routes.js — mounted under /api/mock/stress, behind the
 * same bearerAuth every other mock route uses.
 */

const { Router } = require("express");
const ctrl = require("../controllers/stress.controller");

const router = Router();

router.post("/seed",   ctrl.seed);
router.post("/reset",  ctrl.reset);
router.get ("/counts", ctrl.counts);

module.exports = router;
