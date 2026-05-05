"use strict";
/**
 * routes/seller.routes.js
 *
 * Mounts at: /api/v2/seller
 *
 * Routes:
 *   GET  /all_sellers                       → getAllSellers
 *   GET  /single_seller/:id                 → getSingleSeller
 *   POST /                                  → createSeller
 *   PATCH /:id/status                       → updateSellerStatus  (RESTful)
 *   POST /:action/:sellerId                 → sellerActionCompat  (Backend A compatible)
 */

const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/seller.controller");

router.get ("/all_sellers",           ctrl.getAllSellers);
router.get ("/single_seller/:id",     ctrl.getSingleSeller);
router.post("/",                      ctrl.createSeller);
router.patch("/:id/status",           ctrl.updateSellerStatus);

// Backend A calls: POST /api/v2/seller/:action/:sellerId
// Must be LAST to avoid matching before specific routes
router.post("/:action/:sellerId",     ctrl.sellerActionCompat);

module.exports = router;