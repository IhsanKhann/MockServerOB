"use strict";
/**
 * routes/shipper.routes.js
 *
 * Mounts at: /api/v2/shipper
 *
 * Routes:
 *   GET  /all_shippers                      → getAllShippers
 *   GET  /single_shipper/:id                → getSingleShipper
 *   POST /                                  → createShipper
 *   PATCH /:id/status                       → updateShipperStatus  (RESTful)
 *   POST /:action/:shipperId                → shipperActionCompat  (Backend A compatible)
 */

const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/shipper.controller");

router.get ("/all_shippers",          ctrl.getAllShippers);
router.get ("/single_shipper/:id",    ctrl.getSingleShipper);
router.post("/",                      ctrl.createShipper);
router.patch("/:id/status",           ctrl.updateShipperStatus);

// Backend A calls: POST /api/v2/shipper/:action/:shipperId
router.post("/:action/:shipperId",    ctrl.shipperActionCompat);

module.exports = router;