"use strict";
/**
 * server.js — Backend B (Mock Business API)
 *
 * Production-grade mock server that simulates an external PHP/Laravel B2B system.
 * Uses MongoDB Atlas for persistence, full MVC structure, and Docker support.
 *
 * Auth model: Authorization: Bearer <PHP_PARTNER_API_KEY>
 * Response envelope: { success, message, data, meta: { timestamp } }
 */

require("dotenv").config();

const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");

const { connectDB }           = require("./config");
const sellerRoutes            = require("./routes/seller.routes");
const shipperRoutes           = require("./routes/shipper.routes");
const { errorHandler }        = require("./middleware/errorHandler");
const { requestLogger }       = require("./middleware/requestLogger");
const { bearerAuth }          = require("./middleware/bearerAuth");
const { fail }                = require("./utils/response");

const app  = express();
const PORT = process.env.PORT ?? 3001;

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://backend:5000";

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = [BACKEND_ORIGIN, "http://localhost:5000", "http://localhost:8080", "http://localhost:3000"];
    if (allowed.includes(origin)) return cb(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  allowedHeaders: ["Content-Type", "Accept", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use(express.json());
app.use(requestLogger);

// ─── HEALTH (auth-exempt) ────────────────────────────────────────────────────
const healthHandler = async (_, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ["disconnected", "connected", "connecting", "disconnecting"][dbState] ?? "unknown";
  res.json({
    success: true,
    message: "Mock Business API is running",
    data: { server: "backend-b", version: "3.0.0", db: dbStatus },
    meta: { timestamp: new Date().toISOString() },
  });
};
app.get("/health",     healthHandler);
app.get("/api/health", healthHandler);

// ─── AUTH GUARD (all routes below require Bearer token) ──────────────────────
app.use(bearerAuth);

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use("/api/v2/seller",  sellerRoutes);
app.use("/api/v2/shipper", shipperRoutes);

// ─── 404 CATCH-ALL ───────────────────────────────────────────────────────────
app.use((req, res) => fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404));

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── BOOT ────────────────────────────────────────────────────────────────────
(async () => {
  await connectDB();
  app.listen(PORT, "0.0.0.0", () => {
    console.log("─────────────────────────────────────────────────────────────");
    console.log(`[BOOT] Backend B (Mock Business API) v3.0.0`);
    console.log(`[BOOT] Listening on  : http://0.0.0.0:${PORT}`);
    console.log(`[BOOT] Health checks : GET /health  |  GET /api/health`);
    console.log(`[BOOT] Auth model    : Authorization: Bearer <PHP_PARTNER_API_KEY>`);
    console.log(`[BOOT] CORS origin   : ${BACKEND_ORIGIN}`);
    console.log("─────────────────────────────────────────────────────────────");
  });
})();