"use strict";
/**
 * routes/buyer.routes.js
 *
 * Mounts at: /api/v2/buyer
 *
 * Routes:
 *   GET /all_buyers        → getAllBuyers
 *   GET /single_buyer/:id  → getSingleBuyer
 *
 * Read-only — see controllers/buyer.controller.js for why there's no
 * create/lifecycle route here.
 */

const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/buyer.controller");

router.get("/all_buyers",       ctrl.getAllBuyers);
router.get("/single_buyer/:id", ctrl.getSingleBuyer);

module.exports = router;
