/**
 * mockApi.js — Asfandiyar's Business Server (Mock)
 *
 * Run standalone:  node mockApi.js
 * Default port:    3000
 *
 * Mirrors the real PHP API contract so the finance server can be developed
 * and tested end-to-end without the real B2B server being available.
 *
 * Endpoints:
 *   GET  /api/v2/seller/all_sellers
 *   GET  /api/v2/seller/single_seller/:id
 *   GET  /api/v2/shipper/all_shippers
 *   GET  /api/v2/shipper/single_shipper/:id
 *   GET  /api/v2/buyer/all_buyers
 *   GET  /api/v2/buyer/single_buyer/:id
 *   POST /api/v2/order/receive_breakup   <- finance server pushes breakup here
 *   GET  /health
 */

const express = require("express");
const cors    = require("cors");
const app     = express();

app.use((req, res, next) => {
  console.log("\n🟡 MOCK SERVER HIT");
  console.log("➡️ URL:", req.method, req.url);
  next();
});

app.use(express.json());
app.use(cors());

// ─── Logger ───────────────────────────────────────────────────────────────────
// All output goes to stdout so Docker picks it up via `docker logs`.
// Format:  [LEVEL] [TIMESTAMP] message
const log = {
  info:  (msg) => console.log(`[INFO]  [${new Date().toISOString()}] ${msg}`),
  warn:  (msg) => console.warn(`[WARN]  [${new Date().toISOString()}] ${msg}`),
  error: (msg) => console.error(`[ERROR] [${new Date().toISOString()}] ${msg}`),
  req:   (msg) => console.log(`[REQ]   [${new Date().toISOString()}] ${msg}`),
  res:   (msg) => console.log(`[RES]   [${new Date().toISOString()}] ${msg}`),
};

// ─── Request Logger Middleware ────────────────────────────────────────────────
// Runs before every route. Tells you exactly what hit the server.
app.use((req, res, next) => {
  log.req(`Incoming ${req.method} ${req.originalUrl}`);
  log.req(`  Remote IP : ${req.ip || req.socket?.remoteAddress || "unknown"}`);
  log.req(`  User-Agent: ${req.headers["user-agent"] || "not set"}`);

  const bodyKeys = Object.keys(req.body || {});
  if (bodyKeys.length > 0) {
    log.req(`  Body keys : ${bodyKeys.join(", ")}`);
    log.req(`  Body      : ${JSON.stringify(req.body)}`);
  } else {
    log.req(`  Body      : (empty)`);
  }

  // Attach a timestamp so we can log response time later
  req._startAt = Date.now();

  // Intercept res.json so every outgoing payload is also logged
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    const ms = Date.now() - req._startAt;
    log.res(`Outgoing ${req.method} ${req.originalUrl} -> HTTP ${res.statusCode} (${ms}ms)`);
    log.res(`  Payload   : ${JSON.stringify(payload)}`);
    return originalJson(payload);
  };

  next();
});

// ─── Sellers ──────────────────────────────────────────────────────────────────
const SELLERS = [
  { id: 1,  f_name: "Ali",      l_name: "Hassan",     email: "ali.hassan@gmail.com",    phone: "03001234567", city: "Lahore",     status: "active",    paymentInfo: { iban: "PK36SCBL0000001123456702", accountTitle: "Ali Hassan",      bankName: "Standard Chartered", preferredMethod: "iban",     swiftCode: null,    cnic: "35202-1234567-1", kycVerified: true  } },
  { id: 2,  f_name: "Fatima",   l_name: "Sheikh",     email: "fatima.s@hotmail.com",    phone: "03111234567", city: "Karachi",    status: "active",    paymentInfo: { iban: "PK24MLBL0001000739490010", accountTitle: "Fatima Sheikh",   bankName: "MCB Bank",          preferredMethod: "iban",     swiftCode: null,    cnic: "42201-7654321-2", kycVerified: true  } },
  { id: 3,  f_name: "Usman",    l_name: "Tariq",      email: "usman.t@yahoo.com",       phone: "03211234567", city: "Islamabad",  status: "active",    paymentInfo: { iban: "PK46MEZN0001020101030015", accountTitle: "Usman Tariq",     bankName: "Meezan Bank",       preferredMethod: "iban",     swiftCode: null,    cnic: "61101-5555555-3", kycVerified: true  } },
  { id: 4,  f_name: "Ayesha",   l_name: "Malik",      email: "ayesha.m@gmail.com",      phone: "03331234567", city: "Peshawar",   status: "active",    paymentInfo: { iban: "PK29HABB0000000123456701", accountTitle: "Ayesha Malik",    bankName: "HBL",               preferredMethod: "easypaisa", swiftCode: null,    cnic: "17301-2222222-4", kycVerified: false } },
  { id: 5,  f_name: "Bilal",    l_name: "Khan",       email: "bilal.k@outlook.com",     phone: "03451234567", city: "Multan",     status: "suspended", paymentInfo: { iban: "PK39ALFH0010001234567800", accountTitle: "Bilal Khan",      bankName: "Alfalah Bank",      preferredMethod: "iban",     swiftCode: null,    cnic: "36301-3333333-5", kycVerified: true  } },
  { id: 6,  f_name: "Sana",     l_name: "Iqbal",      email: "sana.iqbal@gmail.com",    phone: "03021234567", city: "Lahore",     status: "active",    paymentInfo: { iban: "PK36SCBL0000001234567802", accountTitle: "Sana Iqbal",      bankName: "Standard Chartered", preferredMethod: "iban",     swiftCode: null,    cnic: "35202-4444444-6", kycVerified: true  } },
  { id: 7,  f_name: "Hamza",    l_name: "Qureshi",    email: "hamza.q@gmail.com",       phone: "03121234567", city: "Karachi",    status: "active",    paymentInfo: { iban: "PK24MLBL0001000739490020", accountTitle: "Hamza Qureshi",   bankName: "MCB Bank",          preferredMethod: "jazzCash",  swiftCode: null,    cnic: "42201-5555555-7", kycVerified: true  } },
  { id: 8,  f_name: "Zainab",   l_name: "Butt",       email: "zainab.b@hotmail.com",    phone: "03221234567", city: "Rawalpindi", status: "active",    paymentInfo: { iban: "PK46MEZN0001020101030025", accountTitle: "Zainab Butt",     bankName: "Meezan Bank",       preferredMethod: "iban",     swiftCode: null,    cnic: "37202-6666666-8", kycVerified: true  } },
  { id: 9,  f_name: "Omar",     l_name: "Farooq",     email: "omar.f@gmail.com",        phone: "03341234567", city: "Lahore",     status: "active",    paymentInfo: { iban: "PK29HABB0000000123456702", accountTitle: "Omar Farooq",     bankName: "HBL",               preferredMethod: "iban",     swiftCode: null,    cnic: "35202-7777777-9", kycVerified: false } },
  { id: 10, f_name: "Mariam",   l_name: "Chaudhry",   email: "mariam.c@gmail.com",      phone: "03441234567", city: "Faisalabad", status: "active",    paymentInfo: { iban: "PK39ALFH0010001234567810", accountTitle: "Mariam Chaudhry", bankName: "Alfalah Bank",      preferredMethod: "iban",     swiftCode: null,    cnic: "33202-8888888-0", kycVerified: true  } },
  { id: 11, f_name: "Saad",     l_name: "Rehman",     email: "saad.r@yahoo.com",        phone: "03011234567", city: "Sialkot",    status: "active",    paymentInfo: { iban: "PK36SCBL0000001234567803", accountTitle: "Saad Rehman",     bankName: "Standard Chartered", preferredMethod: "iban",     swiftCode: null,    cnic: "34101-1111111-1", kycVerified: true  } },
  { id: 12, f_name: "Nadia",    l_name: "Siddiqui",   email: "nadia.s@gmail.com",       phone: "03131234567", city: "Hyderabad",  status: "active",    paymentInfo: { iban: "PK24MLBL0001000739490030", accountTitle: "Nadia Siddiqui",  bankName: "MCB Bank",          preferredMethod: "iban",     swiftCode: null,    cnic: "41302-9999999-2", kycVerified: true  } },
  { id: 13, f_name: "Asif",     l_name: "Riaz",       email: "asif.r@outlook.com",      phone: "03231234567", city: "Quetta",     status: "blocked",   paymentInfo: { iban: "PK46MEZN0001020101030035", accountTitle: "Asif Riaz",       bankName: "Meezan Bank",       preferredMethod: "iban",     swiftCode: null,    cnic: "51302-2222222-3", kycVerified: false } },
  { id: 14, f_name: "Hina",     l_name: "Abbasi",     email: "hina.a@gmail.com",        phone: "03351234567", city: "Peshawar",   status: "active",    paymentInfo: { iban: "PK29HABB0000000123456703", accountTitle: "Hina Abbasi",     bankName: "HBL",               preferredMethod: "iban",     swiftCode: null,    cnic: "17301-3333333-4", kycVerified: true  } },
  { id: 15, f_name: "Kamran",   l_name: "Javed",      email: "kamran.j@gmail.com",      phone: "03451111567", city: "Lahore",     status: "active",    paymentInfo: { iban: "PK39ALFH0010001234567820", accountTitle: "Kamran Javed",    bankName: "Alfalah Bank",      preferredMethod: "iban",     swiftCode: null,    cnic: "35202-4444441-5", kycVerified: true  } },
  { id: 16, f_name: "Rukhsana", l_name: "Patel",      email: "rukhsana.p@gmail.com",    phone: "03031234567", city: "Karachi",    status: "active",    paymentInfo: { iban: "PK36SCBL0000001234567804", accountTitle: "Rukhsana Patel",  bankName: "Standard Chartered", preferredMethod: "jazzCash",  swiftCode: null,    cnic: "42201-6666661-6", kycVerified: true  } },
  { id: 17, f_name: "Tariq",    l_name: "Mehmood",    email: "tariq.m@hotmail.com",     phone: "03141234567", city: "Islamabad",  status: "active",    paymentInfo: { iban: "PK24MLBL0001000739490040", accountTitle: "Tariq Mehmood",   bankName: "MCB Bank",          preferredMethod: "iban",     swiftCode: null,    cnic: "61101-7777771-7", kycVerified: false } },
  { id: 18, f_name: "Amna",     l_name: "Zafar",      email: "amna.z@gmail.com",        phone: "03241234567", city: "Multan",     status: "active",    paymentInfo: { iban: "PK46MEZN0001020101030045", accountTitle: "Amna Zafar",      bankName: "Meezan Bank",       preferredMethod: "iban",     swiftCode: null,    cnic: "36301-8888881-8", kycVerified: true  } },
  { id: 19, f_name: "Faisal",   l_name: "Nawaz",      email: "faisal.n@yahoo.com",      phone: "03361234567", city: "Gujranwala", status: "active",    paymentInfo: { iban: "PK29HABB0000000123456704", accountTitle: "Faisal Nawaz",    bankName: "HBL",               preferredMethod: "iban",     swiftCode: null,    cnic: "34201-9999991-9", kycVerified: true  } },
  { id: 20, f_name: "Sadia",    l_name: "Waseem",     email: "sadia.w@gmail.com",       phone: "03461234567", city: "Faisalabad", status: "active",    paymentInfo: { iban: "PK39ALFH0010001234567830", accountTitle: "Sadia Waseem",    bankName: "Alfalah Bank",      preferredMethod: "easypaisa", swiftCode: null,    cnic: "33202-1111110-0", kycVerified: true  } },
];

// ─── Shippers ─────────────────────────────────────────────────────────────────
const SHIPPERS = [
  { id: 1,  name: "TCS Express",        type: "external",     phone: "021-111-123456",  email: "finance@tcs.com.pk",        city: "Karachi",    coverage: "nationwide",    rating: 4.5, bankDetails: { iban: "PK36SCBL0000001234567890", accountTitle: "TCS Private Limited",      bankName: "Standard Chartered", branchCode: "0001", swiftCode: "SCBLPKKA",    cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 2,  name: "Leopards Courier",   type: "external",     phone: "021-111-300786",  email: "accounts@leopards.pk",      city: "Lahore",     coverage: "nationwide",    rating: 4.3, bankDetails: { iban: "PK29HABB0000000123456799", accountTitle: "Leopards Courier Services", bankName: "HBL",               branchCode: "0002", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 3,  name: "M&P Logistics",      type: "external",     phone: "021-111-345678",  email: "billing@mnp.com.pk",        city: "Karachi",    coverage: "nationwide",    rating: 4.2, bankDetails: { iban: "PK24MLBL0001000739490099", accountTitle: "M&P Logistics",            bankName: "MCB Bank",          branchCode: "0003", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 4,  name: "BlueEx",             type: "external",     phone: "042-111-258386",  email: "finance@blueex.com.pk",     city: "Lahore",     coverage: "nationwide",    rating: 4.1, bankDetails: { iban: "PK46MEZN0001020101030099", accountTitle: "BlueEx Courier",           bankName: "Meezan Bank",       branchCode: "0004", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 5,  name: "Swyft Logistics",    type: "external",     phone: "051-111-799831",  email: "payments@swyft.pk",         city: "Islamabad",  coverage: "nationwide",    rating: 4.4, bankDetails: { iban: "PK39ALFH0010001234567899", accountTitle: "Swyft Logistics Pvt Ltd",  bankName: "Alfalah Bank",      branchCode: "0005", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 6,  name: "Trax Logistics",     type: "external",     phone: "042-111-872991",  email: "accounts@traxlogistics.pk", city: "Lahore",     coverage: "nationwide",    rating: 4.0, bankDetails: { iban: "PK36SCBL0000001234567891", accountTitle: "Trax Logistics",           bankName: "Standard Chartered", branchCode: "0006", swiftCode: null,           cnic: null, kycVerified: false, preferredMethod: "iban"     } },
  { id: 7,  name: "PostEx",             type: "external",     phone: "042-111-111-767", email: "finance@postex.pk",         city: "Lahore",     coverage: "nationwide",    rating: 4.6, bankDetails: { iban: "PK29HABB0000000123456798", accountTitle: "PostEx Pvt Ltd",           bankName: "HBL",               branchCode: "0007", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 8,  name: "Pak Logix",          type: "external",     phone: "042-358-45612",   email: "billing@paklogix.com.pk",   city: "Lahore",     coverage: "Punjab",        rating: 3.8, bankDetails: { iban: "PK24MLBL0001000739490098", accountTitle: "Pak Logix",                bankName: "MCB Bank",          branchCode: "0008", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "jazzCash" } },
  { id: 9,  name: "DHL Pakistan",       type: "external",     phone: "021-111-345000",  email: "pkaccounts@dhl.com",        city: "Karachi",    coverage: "international", rating: 4.8, bankDetails: { iban: "PK46MEZN0001020101030098", accountTitle: "DHL Pakistan Pvt Ltd",     bankName: "Meezan Bank",       branchCode: "0009", swiftCode: "MEZNPKKA",    cnic: null, kycVerified: true,  preferredMethod: "swift"    } },
  { id: 10, name: "FedEx Pakistan",     type: "external",     phone: "021-111-003339",  email: "pk.billing@fedex.com",      city: "Karachi",    coverage: "international", rating: 4.7, bankDetails: { iban: "PK39ALFH0010001234567898", accountTitle: "FedEx Express Pakistan",   bankName: "Alfalah Bank",      branchCode: "0010", swiftCode: "ALFHPKKAXXX", cnic: null, kycVerified: true,  preferredMethod: "swift"    } },
  { id: 11, name: "OB Speed Delivery",  type: "offerberries", phone: "051-111-627363",  email: "delivery@offerberries.com", city: "Islamabad",  coverage: "nationwide",    rating: 4.9, bankDetails: { iban: null, accountTitle: null, bankName: null, branchCode: null, swiftCode: null, cnic: null, kycVerified: true, preferredMethod: "internal" } },
  { id: 12, name: "Rider Courier",      type: "external",     phone: "021-111-743337",  email: "finance@rider.pk",          city: "Karachi",    coverage: "Sindh",         rating: 3.9, bankDetails: { iban: "PK36SCBL0000001234567892", accountTitle: "Rider Courier Pvt Ltd",    bankName: "Standard Chartered", branchCode: "0012", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 13, name: "Mover's Logistics",  type: "external",     phone: "042-357-12345",   email: "accounts@movers.pk",        city: "Lahore",     coverage: "Punjab",        rating: 3.7, bankDetails: { iban: "PK29HABB0000000123456797", accountTitle: "Movers Logistics",         bankName: "HBL",               branchCode: "0013", swiftCode: null,           cnic: null, kycVerified: false, preferredMethod: "iban"     } },
  { id: 14, name: "Quickship Express",  type: "external",     phone: "051-234-56789",   email: "billing@quickship.pk",      city: "Rawalpindi", coverage: "KPK/Punjab",    rating: 4.0, bankDetails: { iban: "PK24MLBL0001000739490097", accountTitle: "Quickship Express",        bankName: "MCB Bank",          branchCode: "0014", swiftCode: null,           cnic: null, kycVerified: true,  preferredMethod: "iban"     } },
  { id: 15, name: "Speedways Courier",  type: "external",     phone: "021-999-87654",   email: "finance@speedways.pk",      city: "Karachi",    coverage: "nationwide",    rating: 3.6, bankDetails: { iban: "PK46MEZN0001020101030097", accountTitle: "Speedways Courier",        bankName: "Meezan Bank",       branchCode: "0015", swiftCode: null,           cnic: null, kycVerified: false, preferredMethod: "iban"     } },
];

// ─── Buyers ───────────────────────────────────────────────────────────────────
const BUYERS = Array.from({ length: 30 }, (_, i) => {
  const names     = ["Ahmed","Sara","Zara","Usman","Hania","Raza","Maha","Adeel","Saba","Waqar","Noor","Danish","Amara","Kashif","Iqra","Saim","Rabia","Junaid","Lubna","Rehan","Naila","Fawad","Benish","Shoaib","Tooba","Murad","Sonia","Imran","Hira","Aamir"];
  const lastNames = ["Shah","Baig","Mirza","Syed","Chaudhry","Ansari","Kazmi","Aslam","Gillani","Hashmi","Sadiq","Alvi","Bajwa","Gondal","Memon","Khattak","Baloch","Niazi","Rajput","Lodhi"];
  const fn = names[i % names.length];
  const ln = lastNames[i % lastNames.length];
  return {
    id:           i + 1,
    f_name:       fn,
    l_name:       ln,
    email:        `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@gmail.com`,
    phone:        `030${String(i + 1).padStart(8, "0")}`,
    city:         ["Karachi","Lahore","Islamabad","Multan","Peshawar","Quetta","Faisalabad","Sialkot"][i % 8],
    address:      `House #${i + 1}, Street ${i % 20 + 1}, Block ${String.fromCharCode(65 + (i % 10))}`,
    registeredAt: new Date(Date.now() - (i * 7 * 24 * 60 * 60 * 1000)).toISOString(),
  };
});

// ─── Response Helpers ─────────────────────────────────────────────────────────
const ok  = (res, data, msg = "Success")  => res.json({ success: true,  message: msg,  data });
const err = (res, msg, code = 404)        => res.status(code).json({ success: false, message: msg, data: null });

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_, res) => {
  log.info("Health check hit");
  return res.json({
    status:  "ok",
    message: "Mock Business API is running",
    server:  "mock-business-api",
    counts:  { sellers: SELLERS.length, shippers: SHIPPERS.length, buyers: BUYERS.length },
    ts:      new Date().toISOString(),
  });
});

// ─── Sellers ──────────────────────────────────────────────────────────────────
app.get("/api/v2/seller/all_sellers", (_, res) => {
  try {
    log.info("Handler: GET /api/v2/seller/all_sellers");

    if (!SELLERS || SELLERS.length === 0) {
      log.warn("Sellers list is empty - returning empty array");
      return ok(res, [], "No sellers found");
    }

    log.info(`Sellers found: ${SELLERS.length}`);
    return ok(res, SELLERS, `${SELLERS.length} seller(s) returned`);
  } catch (e) {
    log.error(`all_sellers failed: ${e.message}`);
    return err(res, `Internal error while fetching sellers: ${e.message}`, 500);
  }
});

app.get("/api/v2/seller/single_seller/:id", (req, res) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    log.info(`Handler: GET /api/v2/seller/single_seller/:id  (requested id=${rawId})`);

    if (isNaN(id)) {
      log.warn(`Invalid seller id received: "${rawId}" - not a number`);
      return err(res, `Invalid seller id: "${rawId}" is not a valid number`, 400);
    }

    const seller = SELLERS.find((s) => s.id === id);

    if (!seller) {
      log.warn(`Seller not found for id=${id} (searched ${SELLERS.length} records)`);
      return err(res, `Seller with id ${id} not found`, 404);
    }

    log.info(`Seller found: id=${seller.id}, name=${seller.f_name} ${seller.l_name}, status=${seller.status}`);
    return ok(res, seller, "Seller fetched successfully");
  } catch (e) {
    log.error(`single_seller failed for id=${rawId}: ${e.message}`);
    return err(res, `Internal error while fetching seller ${rawId}: ${e.message}`, 500);
  }
});

// Status actions: approve / reject / block / suspend / terminate
app.post("/api/v2/seller/:action/:sellerId", (req, res) => {
  const { action, sellerId } = req.params;
  const id = Number(sellerId);

  try {
    log.info(`Handler: POST /api/v2/seller/${action}/${sellerId}`);

    if (isNaN(id)) {
      log.warn(`Invalid seller id for action "${action}": "${sellerId}"`);
      return err(res, `Invalid seller id: "${sellerId}" is not a valid number`, 400);
    }

    const seller = SELLERS.find((s) => s.id === id);

    if (!seller) {
      log.warn(`Action "${action}" failed - seller id=${id} not found`);
      return err(res, `Seller with id ${id} not found`, 404);
    }

    log.info(`Action "${action}" applied to seller id=${id} (${seller.f_name} ${seller.l_name})`);
    return ok(res, { sellerId: id, action }, `Seller ${action}ed successfully`);
  } catch (e) {
    log.error(`seller action "${action}" failed for id=${sellerId}: ${e.message}`);
    return err(res, `Internal error during seller action: ${e.message}`, 500);
  }
});

// ─── Shippers ─────────────────────────────────────────────────────────────────
app.get("/api/v2/shipper/all_shippers", (_, res) => {
  try {
    log.info("Handler: GET /api/v2/shipper/all_shippers");

    if (!SHIPPERS || SHIPPERS.length === 0) {
      log.warn("Shippers list is empty - returning empty array");
      return ok(res, [], "No shippers found");
    }

    log.info(`Shippers found: ${SHIPPERS.length}`);
    return ok(res, SHIPPERS, `${SHIPPERS.length} shipper(s) returned`);
  } catch (e) {
    log.error(`all_shippers failed: ${e.message}`);
    return err(res, `Internal error while fetching shippers: ${e.message}`, 500);
  }
});

app.get("/api/v2/shipper/single_shipper/:id", (req, res) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    log.info(`Handler: GET /api/v2/shipper/single_shipper/:id  (requested id=${rawId})`);

    if (isNaN(id)) {
      log.warn(`Invalid shipper id received: "${rawId}" - not a number`);
      return err(res, `Invalid shipper id: "${rawId}" is not a valid number`, 400);
    }

    const shipper = SHIPPERS.find((s) => s.id === id);

    if (!shipper) {
      log.warn(`Shipper not found for id=${id} (searched ${SHIPPERS.length} records)`);
      return err(res, `Shipper with id ${id} not found`, 404);
    }

    log.info(`Shipper found: id=${shipper.id}, name=${shipper.name}, type=${shipper.type}, coverage=${shipper.coverage}`);
    return ok(res, shipper, "Shipper fetched successfully");
  } catch (e) {
    log.error(`single_shipper failed for id=${rawId}: ${e.message}`);
    return err(res, `Internal error while fetching shipper ${rawId}: ${e.message}`, 500);
  }
});

app.post("/api/v2/shipper/:action/:shipperId", (req, res) => {
  const { action, shipperId } = req.params;
  const id = Number(shipperId);

  try {
    log.info(`Handler: POST /api/v2/shipper/${action}/${shipperId}`);

    if (isNaN(id)) {
      log.warn(`Invalid shipper id for action "${action}": "${shipperId}"`);
      return err(res, `Invalid shipper id: "${shipperId}" is not a valid number`, 400);
    }

    const shipper = SHIPPERS.find((s) => s.id === id);

    if (!shipper) {
      log.warn(`Action "${action}" failed - shipper id=${id} not found`);
      return err(res, `Shipper with id ${id} not found`, 404);
    }

    log.info(`Action "${action}" applied to shipper id=${id} (${shipper.name})`);
    return ok(res, { shipperId: id, action }, `Shipper ${action}ed successfully`);
  } catch (e) {
    log.error(`shipper action "${action}" failed for id=${shipperId}: ${e.message}`);
    return err(res, `Internal error during shipper action: ${e.message}`, 500);
  }
});

// ─── Buyers ───────────────────────────────────────────────────────────────────
app.get("/api/v2/buyer/all_buyers", (_, res) => {
  try {
    log.info("Handler: GET /api/v2/buyer/all_buyers");

    if (!BUYERS || BUYERS.length === 0) {
      log.warn("Buyers list is empty - returning empty array");
      return ok(res, [], "No buyers found");
    }

    log.info(`Buyers found: ${BUYERS.length}`);
    return ok(res, BUYERS, `${BUYERS.length} buyer(s) returned`);
  } catch (e) {
    log.error(`all_buyers failed: ${e.message}`);
    return err(res, `Internal error while fetching buyers: ${e.message}`, 500);
  }
});

app.get("/api/v2/buyer/single_buyer/:id", (req, res) => {
  const rawId = req.params.id;
  const id    = Number(rawId);

  try {
    log.info(`Handler: GET /api/v2/buyer/single_buyer/:id  (requested id=${rawId})`);

    if (isNaN(id)) {
      log.warn(`Invalid buyer id received: "${rawId}" - not a number`);
      return err(res, `Invalid buyer id: "${rawId}" is not a valid number`, 400);
    }

    const buyer = BUYERS.find((b) => b.id === id);

    if (!buyer) {
      log.warn(`Buyer not found for id=${id} (searched ${BUYERS.length} records)`);
      return err(res, `Buyer with id ${id} not found`, 404);
    }

    log.info(`Buyer found: id=${buyer.id}, name=${buyer.f_name} ${buyer.l_name}, city=${buyer.city}`);
    return ok(res, buyer, "Buyer fetched successfully");
  } catch (e) {
    log.error(`single_buyer failed for id=${rawId}: ${e.message}`);
    return err(res, `Internal error while fetching buyer ${rawId}: ${e.message}`, 500);
  }
});

// ─── Order Breakup Receiver ───────────────────────────────────────────────────
// Finance server calls this after processing each order to push the 3-part breakup.
const receivedBreakups = [];

app.post("/api/v2/order/receive_breakup", (req, res) => {
  try {
    log.info("Handler: POST /api/v2/order/receive_breakup");

    const breakup = req.body;

    if (!breakup || Object.keys(breakup).length === 0) {
      log.warn("receive_breakup called with empty body");
      return err(res, "Request body is empty - orderId and breakup data are required", 400);
    }

    if (!breakup.orderId) {
      log.warn(`receive_breakup missing orderId - received keys: ${Object.keys(breakup).join(", ")}`);
      return err(res, "orderId is required in the request body", 400);
    }

    log.info(`Processing breakup for orderId=${breakup.orderId}`);

    const existing = receivedBreakups.find((b) => b.orderId === breakup.orderId);

    if (existing) {
      log.warn(`Duplicate breakup received for orderId=${breakup.orderId} - returning cached record (idempotent)`);
      return ok(res, existing, "Breakup already received (idempotent)");
    }

    const record = { ...breakup, receivedAt: new Date().toISOString() };
    receivedBreakups.push(record);

    log.info(`Breakup stored for orderId=${breakup.orderId} - total breakups in memory: ${receivedBreakups.length}`);
    return ok(res, { orderId: breakup.orderId }, "Breakup received and stored successfully");
  } catch (e) {
    log.error(`receive_breakup failed: ${e.message}`);
    return err(res, `Internal error while processing breakup: ${e.message}`, 500);
  }
});

app.get("/api/v2/order/breakups", (_, res) => {
  try {
    log.info("Handler: GET /api/v2/order/breakups");

    if (receivedBreakups.length === 0) {
      log.warn("No breakups in memory - returning empty array");
      return ok(res, [], "No breakups received yet");
    }

    log.info(`Returning ${receivedBreakups.length} breakup(s) from memory`);
    return ok(res, receivedBreakups, `${receivedBreakups.length} breakup(s) returned`);
  } catch (e) {
    log.error(`order/breakups fetch failed: ${e.message}`);
    return err(res, `Internal error while fetching breakups: ${e.message}`, 500);
  }
});

// ─── 404 Catch-All ────────────────────────────────────────────────────────────
// Any route not matched above will land here instead of Express's default HTML error page.
app.use((req, res) => {
  log.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  return err(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Catches any synchronous or async error that bubbles up through next(err).
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  log.error(`Unhandled exception on ${req.method} ${req.originalUrl}: ${error.message}`);
  log.error(`Stack: ${error.stack}`);
  return err(res, `Unexpected server error: ${error.message}`, 500);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
const PORT = 3000;

app.listen(PORT, "0.0.0.0", () => {
  log.info("-----------------------------------------------------");
  log.info("Mock Business API started");
  log.info(`Listening on http://0.0.0.0:${PORT}`);
  log.info(`Health check : GET http://0.0.0.0:${PORT}/health`);
  log.info(`Sellers      : ${SELLERS.length} records loaded`);
  log.info(`Shippers     : ${SHIPPERS.length} records loaded`);
  log.info(`Buyers       : ${BUYERS.length} records loaded`);
  log.info("-----------------------------------------------------");
});
