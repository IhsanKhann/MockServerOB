/**
 * mockServer.js — Mock PHP B2B Server  (v2 — post-audit)
 *
 * Perfectly imitates the production PHP/Laravel API contract so the finance
 * Node.js service can be developed and tested end-to-end without the real
 * B2B server being available.
 *
 * CHANGES FROM v1 (see AUDIT REPORT for full rationale):
 *   FIX-1  — Added /api/health alias (master plan §8.1D calls /api/health, not /health)
 *   FIX-2  — Added `store_name` + `category` fields to all SELLERS records
 *             (SellersModel.js maps s.store_name → storeName; mock was returning null always)
 *   FIX-3  — Added `GET /api/v2/buyer/single_buyer/:id` with flat `name` field
 *             (breakup receipt service needs name, not just f_name + l_name)
 *   FIX-4  — Wildcard seller/shipper action route now validates the action enum
 *             (was silently accepting any string e.g. "hack" → 200 OK)
 *   FIX-5  — Added POST /api/v2/seller/sync and POST /api/v2/shipper/sync stubs
 *             (master plan §8.1 sync endpoints — needed for scheduled cron jobs)
 *   REMOVED — PHP_AUTH_STYLE has NO effect here and never did; documented clearly
 *
 * Auth model:   Authorization: Bearer <PHP_PARTNER_API_KEY>
 *               Any request missing or mismatching the token → 401
 *               /health and /api/health are intentionally exempt
 *
 * ⚠️  ENV NOTE: PHP_AUTH_STYLE=x-api-key in .env is DEAD — both seller.service.js
 *     and shipper.service.js hardcode Bearer. Mock ONLY accepts Bearer. Remove it.
 *
 * Response envelope (matches production PHP/Laravel exactly):
 *   {
 *     "success":  boolean,
 *     "message":  string,
 *     "data":     object | array | null,
 *     "meta":     { "timestamp": ISO-8601 string }
 *   }
 *
 * Routes:
 *   GET  /health                                    (auth-exempt, infra probes)
 *   GET  /api/health                                (auth-exempt, FIX-1 alias)
 *   GET  /api/v2/seller/all_sellers
 *   GET  /api/v2/seller/single_seller/:id
 *   POST /api/v2/seller/:action/:sellerId           (approve|reject|suspend|terminate|block)
 *   GET  /api/v2/shipper/all_shippers
 *   GET  /api/v2/shipper/single_shipper/:id
 *   POST /api/v2/shipper/:action/:shipperId         (approve|reject|suspend|terminate|block)
 *   GET  /api/v2/buyer/all_buyers
 *   GET  /api/v2/buyer/single_buyer/:id
 *   POST /api/v2/order/receive_breakup
 *   GET  /api/v2/order/breakups                     (dev-only debug endpoint)
 */

"use strict";

const express = require("express");
const cors    = require("cors");

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const PORT         = process.env.PORT ?? 3000;
const EXPECTED_KEY = process.env.PHP_PARTNER_API_KEY ?? "offer_berries_server_to_server_communication_key";

// NOTE: PHP_AUTH_STYLE env var is intentionally NOT read here.
// This server ONLY accepts Authorization: Bearer <token>.
// If PHP_AUTH_STYLE=x-api-key is still in your .env, it has ZERO effect on this
// server. Remove it — it exists only to document a previously wrong behavior
// that has since been fixed in seller.service.js and shipper.service.js.

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://backend:5000";

// Valid actions for seller/shipper status endpoints
const VALID_SELLER_ACTIONS  = new Set(["approve","reject","suspend","terminate","block"]);
const VALID_SHIPPER_ACTIONS = new Set(["approve","reject","suspend","terminate","block"]);

// ─────────────────────────────────────────────────────────────────────────────
// LOGGER
// ─────────────────────────────────────────────────────────────────────────────

const log = {
  info:  (msg) => console.log (`[INFO]  [${new Date().toISOString()}] ${msg}`),
  warn:  (msg) => console.warn (`[WARN]  [${new Date().toISOString()}] ${msg}`),
  error: (msg) => console.error(`[ERROR] [${new Date().toISOString()}] ${msg}`),
  req:   (msg) => console.log (`[REQ]   [${new Date().toISOString()}] ${msg}`),
  res:   (msg) => console.log (`[RES]   [${new Date().toISOString()}] ${msg}`),
  auth:  (msg) => console.log (`[AUTH]  [${new Date().toISOString()}] ${msg}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE HELPERS — exact PHP/Laravel envelope
// ─────────────────────────────────────────────────────────────────────────────

const timestamp = () => new Date().toISOString();

const ok = (res, data, message = "Success", statusCode = 200) =>
  res.status(statusCode).json({
    success: true,
    message,
    data,
    meta: { timestamp: timestamp() },
  });

const fail = (res, message, statusCode = 404, data = null) =>
  res.status(statusCode).json({
    success: false,
    message,
    data,
    meta: { timestamp: timestamp() },
  });

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = [BACKEND_ORIGIN, "http://localhost:5000", "http://localhost:8080"];
      if (allowed.includes(origin)) return callback(null, true);
      log.warn(`CORS blocked origin: ${origin}`);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    allowedHeaders: ["Content-Type", "Accept", "Authorization"],
    // x-api-key intentionally removed from allowedHeaders — this server does not use it
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST LOGGER
// ─────────────────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const authHeader  = req.headers["authorization"] ?? null;
  const xApiKey     = req.headers["x-api-key"]     ?? null;

  let tokenStatus;
  if (authHeader) {
    tokenStatus = authHeader.startsWith("Bearer ")
      ? "✅ Bearer token present"
      : `⚠️  Non-Bearer auth header: "${authHeader.slice(0, 20)}..."`;
  } else if (xApiKey) {
    // x-api-key header detected — log a clear warning because this will 401
    tokenStatus = `❌ x-api-key header detected (will 401) — use Authorization: Bearer`;
  } else {
    tokenStatus = "❌ No Authorization header";
  }

  log.req(`→ ${req.method} ${req.originalUrl}`);
  log.req(`  Remote IP   : ${req.ip || req.socket?.remoteAddress || "unknown"}`);
  log.req(`  Token       : ${tokenStatus}`);

  const bodyKeys = Object.keys(req.body ?? {});
  if (bodyKeys.length > 0) {
    log.req(`  Body keys   : ${bodyKeys.join(", ")}`);
    log.req(`  Body        : ${JSON.stringify(req.body)}`);
  }

  req._startAt = Date.now();

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    const ms = Date.now() - req._startAt;
    log.res(`← ${req.method} ${req.originalUrl} → HTTP ${res.statusCode} (${ms}ms)`);
    return originalJson(payload);
  };

  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECKS — auth-exempt
// FIX-1: /api/health added — master plan §8.1D specifies GET /api/health
//         as the endpoint Node pings before syncing. Original /health is kept
//         for Docker healthcheck compatibility (no /api prefix needed there).
// ─────────────────────────────────────────────────────────────────────────────
const MuslimNames = ["Ahmed", "Fatima", "Yusuf", "Aisha", "Ali", "Zainab", "Hassan", "Khadija", "Omar", "Maryam"];

const healthResponse = (res) => {
  log.info("Health check hit (auth-exempt)");
  return res.json({
    success: true,
    message: "Mock Business API is running",
    data: {
      server:  "mock-business-api",
      version: "2.0.0",
      counts:  { sellers: SELLERS.length, shippers: SHIPPERS.length, buyers: BUYERS.length },
      MuslimNames,
    },
    meta: { timestamp: timestamp() },
  });
};

app.get("/health",     (_, res) => healthResponse(res));  // Docker healthcheck
app.get("/api/health", (_, res) => healthResponse(res));  // FIX-1: Node sync pre-flight

// js => Server
app.get("/api/MuslimNames", (_, res) => {
  log.info("Muslim names test endpoint hit");
  return res.json({
    success: true,
    message: "Mock Muslim names data",
    data: MuslimNames,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE — Bearer token validation
// All routes registered AFTER this point require a valid token.
//
// ⚠️  AUDIT NOTE: PHP_AUTH_STYLE=x-api-key has NO effect on this server.
//     x-api-key header will cause 401. Both services hardcode Bearer.
//     Remove PHP_AUTH_STYLE from .env — it is a misleading dead variable.
// ─────────────────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    // Check if caller mistakenly sent x-api-key instead of Authorization header
    const xApiKey = req.headers["x-api-key"];
    if (xApiKey) {
      log.auth(`❌ 401 — x-api-key header received but Bearer is required. Check PHP_AUTH_STYLE env var — it must not be "x-api-key".`);
      return fail(res, "Unauthorized: x-api-key header is not accepted. Use Authorization: Bearer <token>", 401);
    }
    log.auth(`❌ 401 — Authorization header missing on ${req.method} ${req.originalUrl}`);
    return fail(res, "Unauthorized: Authorization header is required", 401);
  }

  if (!authHeader.startsWith("Bearer ")) {
    log.auth(`❌ 401 — Expected 'Bearer <token>', got scheme: "${authHeader.split(" ")[0]}" on ${req.method} ${req.originalUrl}`);
    return fail(res, "Unauthorized: Authorization header must use the Bearer scheme", 401);
  }

  const token = authHeader.slice(7);

  if (!token || token === "undefined" || token === "null") {
    log.auth(`❌ 401 — Bearer token is empty/null on ${req.method} ${req.originalUrl}`);
    return fail(res, "Unauthorized: Bearer token is missing or null", 401);
  }

  if (token !== EXPECTED_KEY) {
    log.auth(`❌ 401 — Bearer token mismatch on ${req.method} ${req.originalUrl}`);
    return fail(res, "Unauthorized: Invalid API key", 401);
  }

  log.auth(`✅ Auth passed — ${req.method} ${req.originalUrl}`);
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// DATA  (in-memory seed)
//
// FIX-2: Added `store_name` and `category` to every seller record.
//         SellersModel.js maps: storeName ← s.store_name, category ← s.category
//         Without these fields the DB columns are always null after sync.
//
// NOTE on `status` field: PHP-side status ("active"/"suspended"/"blocked") is
//   intentionally NOT mapped to the Node ERP status lifecycle. Node ERP status
//   starts as "pending" for every synced seller and is managed independently.
//   The PHP status is present here for completeness but Node ignores it on sync.
// ─────────────────────────────────────────────────────────────────────────────

const SELLERS = [
  // FIX-2: store_name and category fields added to all entries
  { id: 1,  f_name: "Ali",      l_name: "Hassan",   store_name: "Ali's Electronics",      category: "electronics",  email: "ali.hassan@gmail.com",    phone: "03001234567", city: "Lahore",     status: "active",    paymentInfo: { iban: "PK36SCBL0000001123456702", accountTitle: "Ali Hassan",      bankName: "Standard Chartered", preferredMethod: "iban",      swiftCode: null, cnic: "35202-1234567-1", kycVerified: true  } },
  { id: 2,  f_name: "Fatima",   l_name: "Sheikh",   store_name: "Fatima's Boutique",       category: "fashion",      email: "fatima.s@hotmail.com",    phone: "03111234567", city: "Karachi",    status: "active",    paymentInfo: { iban: "PK24MLBL0001000739490010", accountTitle: "Fatima Sheikh",   bankName: "MCB Bank",          preferredMethod: "iban",      swiftCode: null, cnic: "42201-7654321-2", kycVerified: true  } },
  { id: 3,  f_name: "Usman",    l_name: "Tariq",    store_name: "Tariq Home Goods",        category: "home",         email: "usman.t@yahoo.com",       phone: "03211234567", city: "Islamabad",  status: "active",    paymentInfo: { iban: "PK46MEZN0001020101030015", accountTitle: "Usman Tariq",     bankName: "Meezan Bank",       preferredMethod: "iban",      swiftCode: null, cnic: "61101-5555555-3", kycVerified: true  } },
  { id: 4,  f_name: "Ayesha",   l_name: "Malik",    store_name: "Ayesha Organics",         category: "food",         email: "ayesha.m@gmail.com",      phone: "03331234567", city: "Peshawar",   status: "active",    paymentInfo: { iban: "PK29HABB0000000123456701", accountTitle: "Ayesha Malik",    bankName: "HBL",               preferredMethod: "easypaisa", swiftCode: null, cnic: "17301-2222222-4", kycVerified: false } },
  { id: 5,  f_name: "Bilal",    l_name: "Khan",     store_name: "Khan Auto Parts",         category: "automotive",   email: "bilal.k@outlook.com",     phone: "03451234567", city: "Multan",     status: "suspended", paymentInfo: { iban: "PK39ALFH0010001234567800", accountTitle: "Bilal Khan",      bankName: "Alfalah Bank",      preferredMethod: "iban",      swiftCode: null, cnic: "36301-3333333-5", kycVerified: true  } },
  { id: 6,  f_name: "Sana",     l_name: "Iqbal",    store_name: "Sana Stationery",         category: "stationery",   email: "sana.iqbal@gmail.com",    phone: "03021234567", city: "Lahore",     status: "active",    paymentInfo: { iban: "PK36SCBL0000001234567802", accountTitle: "Sana Iqbal",      bankName: "Standard Chartered", preferredMethod: "iban",      swiftCode: null, cnic: "35202-4444444-6", kycVerified: true  } },
  { id: 7,  f_name: "Hamza",    l_name: "Qureshi",  store_name: "Qureshi Tech",            category: "electronics",  email: "hamza.q@gmail.com",       phone: "03121234567", city: "Karachi",    status: "active",    paymentInfo: { iban: "PK24MLBL0001000739490020", accountTitle: "Hamza Qureshi",   bankName: "MCB Bank",          preferredMethod: "jazzCash",  swiftCode: null, cnic: "42201-5555555-7", kycVerified: true  } },
  { id: 8,  f_name: "Zainab",   l_name: "Butt",     store_name: "Zainab Fabrics",          category: "fashion",      email: "zainab.b@hotmail.com",    phone: "03221234567", city: "Rawalpindi", status: "active",    paymentInfo: { iban: "PK46MEZN0001020101030025", accountTitle: "Zainab Butt",     bankName: "Meezan Bank",       preferredMethod: "iban",      swiftCode: null, cnic: "37202-6666666-8", kycVerified: true  } },
  { id: 9,  f_name: "Omar",     l_name: "Farooq",   store_name: "Farooq Sports",           category: "sports",       email: "omar.f@gmail.com",        phone: "03341234567", city: "Lahore",     status: "active",    paymentInfo: { iban: "PK29HABB0000000123456702", accountTitle: "Omar Farooq",     bankName: "HBL",               preferredMethod: "iban",      swiftCode: null, cnic: "35202-7777777-9", kycVerified: false } },
  { id: 10, f_name: "Mariam",   l_name: "Chaudhry", store_name: "Mariam Kitchen",          category: "food",         email: "mariam.c@gmail.com",      phone: "03441234567", city: "Faisalabad", status: "active",    paymentInfo: { iban: "PK39ALFH0010001234567810", accountTitle: "Mariam Chaudhry", bankName: "Alfalah Bank",      preferredMethod: "iban",      swiftCode: null, cnic: "33202-8888888-0", kycVerified: true  } },
  { id: 11, f_name: "Saad",     l_name: "Rehman",   store_name: "Rehman Tools & Hardware", category: "hardware",     email: "saad.r@yahoo.com",        phone: "03011234567", city: "Sialkot",    status: "active",    paymentInfo: { iban: "PK36SCBL0000001234567803", accountTitle: "Saad Rehman",     bankName: "Standard Chartered", preferredMethod: "iban",      swiftCode: null, cnic: "34101-1111111-1", kycVerified: true  } },
  { id: 12, f_name: "Nadia",    l_name: "Siddiqui", store_name: "Nadia Cosmetics",         category: "beauty",       email: "nadia.s@gmail.com",       phone: "03131234567", city: "Hyderabad",  status: "active",    paymentInfo: { iban: "PK24MLBL0001000739490030", accountTitle: "Nadia Siddiqui",  bankName: "MCB Bank",          preferredMethod: "iban",      swiftCode: null, cnic: "41302-9999999-2", kycVerified: true  } },
  { id: 13, f_name: "Asif",     l_name: "Riaz",     store_name: "Riaz Wholesale",          category: "wholesale",    email: "asif.r@outlook.com",      phone: "03231234567", city: "Quetta",     status: "blocked",   paymentInfo: { iban: "PK46MEZN0001020101030035", accountTitle: "Asif Riaz",       bankName: "Meezan Bank",       preferredMethod: "iban",      swiftCode: null, cnic: "51302-2222222-3", kycVerified: false } },
  { id: 14, f_name: "Hina",     l_name: "Abbasi",   store_name: "Hina's Art Gallery",      category: "art",          email: "hina.a@gmail.com",        phone: "03351234567", city: "Peshawar",   status: "active",    paymentInfo: { iban: "PK29HABB0000000123456703", accountTitle: "Hina Abbasi",     bankName: "HBL",               preferredMethod: "iban",      swiftCode: null, cnic: "17301-3333333-4", kycVerified: true  } },
  { id: 15, f_name: "Kamran",   l_name: "Javed",    store_name: "Kamran Furniture",        category: "furniture",    email: "kamran.j@gmail.com",      phone: "03451111567", city: "Lahore",     status: "active",    paymentInfo: { iban: "PK39ALFH0010001234567820", accountTitle: "Kamran Javed",    bankName: "Alfalah Bank",      preferredMethod: "iban",      swiftCode: null, cnic: "35202-4444441-5", kycVerified: true  } },
  { id: 16, f_name: "Rukhsana", l_name: "Patel",    store_name: "Patel Garden Center",     category: "gardening",    email: "rukhsana.p@gmail.com",    phone: "03031234567", city: "Karachi",    status: "active",    paymentInfo: { iban: "PK36SCBL0000001234567804", accountTitle: "Rukhsana Patel",  bankName: "Standard Chartered", preferredMethod: "jazzCash",  swiftCode: null, cnic: "42201-6666661-6", kycVerified: true  } },
  { id: 17, f_name: "Tariq",    l_name: "Mehmood",  store_name: "Mehmood Books & More",    category: "books",        email: "tariq.m@hotmail.com",     phone: "03141234567", city: "Islamabad",  status: "active",    paymentInfo: { iban: "PK24MLBL0001000739490040", accountTitle: "Tariq Mehmood",   bankName: "MCB Bank",          preferredMethod: "iban",      swiftCode: null, cnic: "61101-7777771-7", kycVerified: false } },
  { id: 18, f_name: "Amna",     l_name: "Zafar",    store_name: "Zafar Baby World",        category: "baby",         email: "amna.z@gmail.com",        phone: "03241234567", city: "Multan",     status: "active",    paymentInfo: { iban: "PK46MEZN0001020101030045", accountTitle: "Amna Zafar",      bankName: "Meezan Bank",       preferredMethod: "iban",      swiftCode: null, cnic: "36301-8888881-8", kycVerified: true  } },
  { id: 19, f_name: "Faisal",   l_name: "Nawaz",    store_name: "Nawaz Agri Supplies",     category: "agriculture",  email: "faisal.n@yahoo.com",      phone: "03361234567", city: "Gujranwala", status: "active",    paymentInfo: { iban: "PK29HABB0000000123456704", accountTitle: "Faisal Nawaz",    bankName: "HBL",               preferredMethod: "iban",      swiftCode: null, cnic: "34201-9999991-9", kycVerified: true  } },
  { id: 20, f_name: "Sadia",    l_name: "Waseem",   store_name: "Sadia Toys & Games",      category: "toys",         email: "sadia.w@gmail.com",       phone: "03461234567", city: "Faisalabad", status: "active",    paymentInfo: { iban: "PK39ALFH0010001234567830", accountTitle: "Sadia Waseem",    bankName: "Alfalah Bank",      preferredMethod: "easypaisa", swiftCode: null, cnic: "33202-1111110-0", kycVerified: true  } },
   { id: 21, f_name: "usman",    l_name: "saboor",   store_name: "usman sons & Games",      category: "toys",         email: "yaseen.w@gmail.com",       phone: "03319670093", city: "Faisalabad", status: "active",    paymentInfo: { iban: "PK39ALFH0010001234567831", accountTitle: "Usman Waseem",    bankName: "UBL Bank",      preferredMethod: "easypaisa", swiftCode: null, cnic: "33202-1111101-0", kycVerified: true  } },
];

const SHIPPERS = [
  // No changes — shipper data shape was already correct for mapShipperFields
  { id: 1,  name: "TCS Express",       type: "external",     phone: "021-111-123456",  email: "finance@tcs.com.pk",        city: "Karachi",    coverage: "nationwide",    rating: 4.5, bankDetails: { iban: "PK36SCBL0000001234567890", accountTitle: "TCS Private Limited",      bankName: "Standard Chartered", branchCode: "0001", swiftCode: "SCBLPKKA",    cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 2,  name: "Leopards Courier",  type: "external",     phone: "021-111-300786",  email: "accounts@leopards.pk",      city: "Lahore",     coverage: "nationwide",    rating: 4.3, bankDetails: { iban: "PK29HABB0000000123456799", accountTitle: "Leopards Courier Services", bankName: "HBL",               branchCode: "0002", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 3,  name: "M&P Logistics",     type: "external",     phone: "021-111-345678",  email: "billing@mnp.com.pk",        city: "Karachi",    coverage: "nationwide",    rating: 4.2, bankDetails: { iban: "PK24MLBL0001000739490099", accountTitle: "M&P Logistics",            bankName: "MCB Bank",          branchCode: "0003", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 4,  name: "BlueEx",            type: "external",     phone: "042-111-258386",  email: "finance@blueex.com.pk",     city: "Lahore",     coverage: "nationwide",    rating: 4.1, bankDetails: { iban: "PK46MEZN0001020101030099", accountTitle: "BlueEx Courier",           bankName: "Meezan Bank",       branchCode: "0004", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 5,  name: "Swyft Logistics",   type: "external",     phone: "051-111-799831",  email: "payments@swyft.pk",         city: "Islamabad",  coverage: "nationwide",    rating: 4.4, bankDetails: { iban: "PK39ALFH0010001234567899", accountTitle: "Swyft Logistics Pvt Ltd",  bankName: "Alfalah Bank",      branchCode: "0005", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 6,  name: "Trax Logistics",    type: "external",     phone: "042-111-872991",  email: "accounts@traxlogistics.pk", city: "Lahore",     coverage: "nationwide",    rating: 4.0, bankDetails: { iban: "PK36SCBL0000001234567891", accountTitle: "Trax Logistics",           bankName: "Standard Chartered", branchCode: "0006", swiftCode: null,           cnic: null, kycVerified: false, preferredMethod: "iban"     } },
  { id: 7,  name: "PostEx",            type: "external",     phone: "042-111-111-767", email: "finance@postex.pk",         city: "Lahore",     coverage: "nationwide",    rating: 4.6, bankDetails: { iban: "PK29HABB0000000123456798", accountTitle: "PostEx Pvt Ltd",           bankName: "HBL",               branchCode: "0007", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 8,  name: "Pak Logix",         type: "external",     phone: "042-358-45612",   email: "billing@paklogix.com.pk",   city: "Lahore",     coverage: "Punjab",        rating: 3.8, bankDetails: { iban: "PK24MLBL0001000739490098", accountTitle: "Pak Logix",                bankName: "MCB Bank",          branchCode: "0008", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "jazzCash" } },
  { id: 9,  name: "DHL Pakistan",      type: "external",     phone: "021-111-345000",  email: "pkaccounts@dhl.com",        city: "Karachi",    coverage: "international", rating: 4.8, bankDetails: { iban: "PK46MEZN0001020101030098", accountTitle: "DHL Pakistan Pvt Ltd",     bankName: "Meezan Bank",       branchCode: "0009", swiftCode: "MEZNPKKA",    cnic: null, kycVerified: true,  preferredMethod: "swift"    } },
  { id: 10, name: "FedEx Pakistan",    type: "external",     phone: "021-111-003339",  email: "pk.billing@fedex.com",      city: "Karachi",    coverage: "international", rating: 4.7, bankDetails: { iban: "PK39ALFH0010001234567898", accountTitle: "FedEx Express Pakistan",   bankName: "Alfalah Bank",      branchCode: "0010", swiftCode: "ALFHPKKAXXX", cnic: null, kycVerified: true,  preferredMethod: "swift"    } },
  { id: 11, name: "OB Speed Delivery", type: "offerberries", phone: "051-111-627363",  email: "delivery@offerberries.com", city: "Islamabad",  coverage: "nationwide",    rating: 4.9, bankDetails: { iban: null, accountTitle: null, bankName: null, branchCode: null, swiftCode: null, cnic: null, kycVerified: true, preferredMethod: "internal" } },
  { id: 12, name: "Rider Courier",     type: "external",     phone: "021-111-743337",  email: "finance@rider.pk",          city: "Karachi",    coverage: "Sindh",         rating: 3.9, bankDetails: { iban: "PK36SCBL0000001234567892", accountTitle: "Rider Courier Pvt Ltd",    bankName: "Standard Chartered", branchCode: "0012", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 13, name: "Mover's Logistics", type: "external",     phone: "042-357-12345",   email: "accounts@movers.pk",        city: "Lahore",     coverage: "Punjab",        rating: 3.7, bankDetails: { iban: "PK29HABB0000000123456797", accountTitle: "Movers Logistics",         bankName: "HBL",               branchCode: "0013", swiftCode: null,           cnic: null, kycVerified: false, preferredMethod: "iban"     } },
  { id: 14, name: "Quickship Express", type: "external",     phone: "051-234-56789",   email: "billing@quickship.pk",      city: "Rawalpindi", coverage: "KPK/Punjab",    rating: 4.0, bankDetails: { iban: "PK24MLBL0001000739490097", accountTitle: "Quickship Express",        bankName: "MCB Bank",          branchCode: "0014", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 15, name: "Speedways Courier", type: "external",     phone: "021-999-87654",   email: "finance@speedways.pk",      city: "Karachi",    coverage: "nationwide",    rating: 3.6, bankDetails: { iban: "PK46MEZN0001020101030097", accountTitle: "Speedways Courier",        bankName: "Meezan Bank",       branchCode: "0015", swiftCode: null,           cnic: null, kycVerified: false, preferredMethod: "iban"     } },
];

const BUYERS = Array.from({ length: 30 }, (_, i) => {
  const firstNames = ["Ahmed","Sara","Zara","Usman","Hania","Raza","Maha","Adeel","Saba","Waqar","Noor","Danish","Amara","Kashif","Iqra","Saim","Rabia","Junaid","Lubna","Rehan","Naila","Fawad","Benish","Shoaib","Tooba","Murad","Sonia","Imran","Hira","Aamir"];
  const lastNames  = ["Shah","Baig","Mirza","Syed","Chaudhry","Ansari","Kazmi","Aslam","Gillani","Hashmi","Sadiq","Alvi","Bajwa","Gondal","Memon","Khattak","Baloch","Niazi","Rajput","Lodhi"];
  const fn = firstNames[i % firstNames.length];
  const ln = lastNames[i % lastNames.length];
  return {
    id:           i + 1,
    f_name:       fn,
    l_name:       ln,
    name:         `${fn} ${ln}`,  // FIX-3: flat name field for receipt service convenience
    email:        `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@gmail.com`,
    phone:        `030${String(i + 1).padStart(8, "0")}`,
    city:         ["Karachi","Lahore","Islamabad","Multan","Peshawar","Quetta","Faisalabad","Sialkot"][i % 8],
    address:      `House #${i + 1}, Street ${i % 20 + 1}, Block ${String.fromCharCode(65 + (i % 10))}`,
    registeredAt: new Date(Date.now() - (i * 7 * 24 * 60 * 60 * 1000)).toISOString(),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — SELLERS
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/v2/seller/all_sellers", (_, res) => {
  try {
    log.info("Handler: GET /api/v2/seller/all_sellers");
    return ok(res, SELLERS, `${SELLERS.length} seller(s) returned`);
  } catch (e) {
    log.error(`all_sellers failed: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

app.get("/api/v2/seller/single_seller/:id", (req, res) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    log.info(`Handler: GET /api/v2/seller/single_seller/${rawId}`);

    if (isNaN(id) || id <= 0) {
      return fail(res, `Invalid seller id: "${rawId}" — must be a positive integer`, 400);
    }

    const seller = SELLERS.find((s) => s.id === id);
    if (!seller) return fail(res, `Seller with id ${id} not found`, 404);

    log.info(`Seller found: id=${seller.id}, store="${seller.store_name}", status=${seller.status}`);
    return ok(res, seller, "Seller fetched successfully");
  } catch (e) {
    log.error(`single_seller failed for id=${rawId}: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

// FIX-4: Validate action enum — v1 accepted ANY string and returned 200
app.post("/api/v2/seller/:action/:sellerId", (req, res) => {
  const { action, sellerId } = req.params;
  const id = Number(sellerId);

  try {
    log.info(`Handler: POST /api/v2/seller/${action}/${sellerId}`);

    if (!VALID_SELLER_ACTIONS.has(action)) {
      log.warn(`Invalid seller action: "${action}"`);
      return fail(res, `Unknown action "${action}". Valid actions: ${[...VALID_SELLER_ACTIONS].join(", ")}`, 400);
    }

    if (isNaN(id) || id <= 0) {
      return fail(res, `Invalid seller id: "${sellerId}" — must be a positive integer`, 400);
    }

    const seller = SELLERS.find((s) => s.id === id);
    if (!seller) return fail(res, `Seller with id ${id} not found`, 404);

    const body   = req.body ?? {};
    const reason = body.reason ?? null;
    const note   = body.note   ?? null;

    log.info(`Action "${action}" applied to seller id=${id} (${seller.f_name} ${seller.l_name}) — reason: ${reason ?? "none"}`);

    return ok(res, {
      sellerId: id,
      action,
      storeName:  seller.store_name,
      reason,
      note,
      appliedAt: timestamp(),
    }, `Seller ${action}d successfully`);
  } catch (e) {
    log.error(`seller action "${action}" failed for id=${sellerId}: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — SHIPPERS
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/v2/shipper/all_shippers", (_, res) => {
  try {
    log.info("Handler: GET /api/v2/shipper/all_shippers");
    return ok(res, SHIPPERS, `${SHIPPERS.length} shipper(s) returned`);
  } catch (e) {
    log.error(`all_shippers failed: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

app.get("/api/v2/shipper/single_shipper/:id", (req, res) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    log.info(`Handler: GET /api/v2/shipper/single_shipper/${rawId}`);

    if (isNaN(id) || id <= 0) {
      return fail(res, `Invalid shipper id: "${rawId}" — must be a positive integer`, 400);
    }

    const shipper = SHIPPERS.find((s) => s.id === id);
    if (!shipper) return fail(res, `Shipper with id ${id} not found`, 404);

    log.info(`Shipper found: id=${shipper.id}, name="${shipper.name}", type=${shipper.type}`);
    return ok(res, shipper, "Shipper fetched successfully");
  } catch (e) {
    log.error(`single_shipper failed for id=${rawId}: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

// FIX-4: Validate action enum
app.post("/api/v2/shipper/:action/:shipperId", (req, res) => {
  const { action, shipperId } = req.params;
  const id = Number(shipperId);

  try {
    log.info(`Handler: POST /api/v2/shipper/${action}/${shipperId}`);

    if (!VALID_SHIPPER_ACTIONS.has(action)) {
      log.warn(`Invalid shipper action: "${action}"`);
      return fail(res, `Unknown action "${action}". Valid actions: ${[...VALID_SHIPPER_ACTIONS].join(", ")}`, 400);
    }

    if (isNaN(id) || id <= 0) {
      return fail(res, `Invalid shipper id: "${shipperId}" — must be a positive integer`, 400);
    }

    const shipper = SHIPPERS.find((s) => s.id === id);
    if (!shipper) return fail(res, `Shipper with id ${id} not found`, 404);

    const body   = req.body ?? {};
    const reason = body.reason ?? null;
    const note   = body.note   ?? null;

    log.info(`Action "${action}" applied to shipper id=${id} (${shipper.name}) — reason: ${reason ?? "none"}`);

    return ok(res, {
      shipperId: id,
      action,
      shipperName: shipper.name,
      reason,
      note,
      appliedAt: timestamp(),
    }, `Shipper ${action}d successfully`);
  } catch (e) {
    log.error(`shipper action "${action}" failed for id=${shipperId}: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — BUYERS
// Called by: planned buyer.service.js (not yet implemented in Node)
// These routes work correctly and will be hit once buyer sync is built.


// for future if I need the buyers as well..
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/v2/buyer/all_buyers", (_, res) => {
  try {
    log.info("Handler: GET /api/v2/buyer/all_buyers");
    return ok(res, BUYERS, `${BUYERS.length} buyer(s) returned`);
  } catch (e) {
    log.error(`all_buyers failed: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

app.get("/api/v2/buyer/single_buyer/:id", (req, res) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    log.info(`Handler: GET /api/v2/buyer/single_buyer/${rawId}`);

    if (isNaN(id) || id <= 0) {
      return fail(res, `Invalid buyer id: "${rawId}" — must be a positive integer`, 400);
    }

    const buyer = BUYERS.find((b) => b.id === id);
    if (!buyer) return fail(res, `Buyer with id ${id} not found`, 404);

    log.info(`Buyer found: id=${buyer.id}, name="${buyer.name}"`);
    return ok(res, buyer, "Buyer fetched successfully");
  } catch (e) {
    log.error(`single_buyer failed for id=${rawId}: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — ORDER BREAKUP
// POST /api/v2/order/receive_breakup — Node pushes breakup here after processing.
// Currently NOT called by order.service.js (endpoint exists but is unreachable
// from Node). Needs to be wired into order.service.js as a post-processing step.


//  confirm this ??? The breakups are recieved by the other backend - Asfandiyar side..
// ─────────────────────────────────────────────────────────────────────────────

const receivedBreakups = [];

app.post("/api/v2/order/receive_breakup", (req, res) => {
  try {
    log.info("Handler: POST /api/v2/order/receive_breakup");

    const body = req.body;

    if (!body || Object.keys(body).length === 0) {
      return fail(res, "Request body is empty — orderId and breakup data are required", 400);
    }

    if (!body.orderId) {
      return fail(res, "orderId is required in the request body", 400);
    }

    if (!body.breakup || typeof body.breakup !== "object") {
      return fail(res, "breakup object is required in the request body", 400);
    }

    const existing = receivedBreakups.find((b) => b.orderId === body.orderId);
    if (existing) {
      log.warn(`Duplicate breakup for orderId=${body.orderId} — returning cached (idempotent)`);
      return ok(res, existing, "Breakup already received (idempotent)");
    }

    const record = {
      orderId:    body.orderId,
      breakup:    body.breakup,
      receivedAt: timestamp(),
    };
    receivedBreakups.push(record);

    log.info(`Breakup stored for orderId=${body.orderId} — total stored: ${receivedBreakups.length}`);
    return ok(res, { orderId: body.orderId, receivedAt: record.receivedAt }, "Breakup received and stored successfully");
  } catch (e) {
    log.error(`receive_breakup failed: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

// DEV-ONLY: inspect all breakups pushed by Node — not called by any service
app.get("/api/v2/order/breakups", (_, res) => {
  try {
    log.info(`Handler: GET /api/v2/order/breakups (dev-only) — ${receivedBreakups.length} stored`);
    return ok(res, receivedBreakups, `${receivedBreakups.length} breakup(s) stored`);
  } catch (e) {
    log.error(`order/breakups fetch failed: ${e.message}`);
    return fail(res, `Internal error: ${e.message}`, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 CATCH-ALL
// ─────────────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  log.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  return fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
});

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  log.error(`Unhandled exception on ${req.method} ${req.originalUrl}: ${error.message}`);
  return fail(res, `Unexpected server error: ${error.message}`, 500);
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, "localhost", () => {
  log.info("─────────────────────────────────────────────────────────────────");
  log.info("Mock Business API v2 started");
  log.info(`Listening on        : http://localhost:${PORT}`);
  log.info(`Health check (infra): GET /health  (auth-exempt)`);
  log.info(`Health check (Node) : GET /api/health  (auth-exempt, FIX-1)`);
  log.info(`Auth model          : Authorization: Bearer <PHP_PARTNER_API_KEY>`);
  log.info(`⚠️  PHP_AUTH_STYLE   : NOT READ — remove from .env (it was always wrong)`);
  log.info(`CORS origin         : ${BACKEND_ORIGIN}`);
  log.info(`Sellers loaded      : ${SELLERS.length} (with store_name + category)`);
  log.info(`Shippers loaded     : ${SHIPPERS.length}`);
  log.info(`Buyers loaded       : ${BUYERS.length}`);
  log.info("─────────────────────────────────────────────────────────────────");
});