/* ── A3.4: Systematic Security Testing ────────────────────────────────
   Programmatic verification of security invariants:
     - Auth bypass attempts (tampered JWTs, missing tokens)
     - Shadow state isolation (I1–I4 invariants)
     - Input validation fuzzing
     - Secret exposure checks

   Requires a running server on port 4000.

   Usage:  npx tsx src/evaluation/security-tests.ts
   ──────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:4000/api";

interface TestResult {
  category: string;
  test: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function record(category: string, test: string, passed: boolean, detail: string) {
  results.push({ category, test, passed, detail });
  const icon = passed ? "✓" : "✗";
  console.log(`  ${icon} ${test}: ${detail}`);
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function get(url: string, headers: Record<string, string> = {}) {
  return fetch(url, { headers });
}

// ── Helper: register + login → token ─────────────────────────────────
async function createUser(suffix: string) {
  const email = `sec_test_${suffix}_${Date.now()}@test.com`;
  const password = "SecureP@ss123!";
  await post(`${BASE}/auth/register`, { email, password, displayName: `SecTest-${suffix}` });
  const loginRes = await post(`${BASE}/auth/login`, { email, password });
  const data = await loginRes.json() as any;
  return { token: data.token, userId: data.session?.userId, sessionId: data.session?.id };
}

// ── 1. Auth Bypass Tests ─────────────────────────────────────────────
async function authBypassTests() {
  console.log("\n  ── AUTH BYPASS TESTS ──");

  // Missing token
  const r1 = await get(`${BASE}/trading/orders`);
  record("auth", "Missing Authorization header → 401", r1.status === 401, `status=${r1.status}`);

  // Malformed token
  const r2 = await get(`${BASE}/trading/orders`, { Authorization: "Bearer not.a.valid.jwt" });
  record("auth", "Malformed JWT → 401", r2.status === 401, `status=${r2.status}`);

  // Empty bearer
  const r3 = await get(`${BASE}/trading/orders`, { Authorization: "Bearer " });
  record("auth", "Empty Bearer value → 401", r3.status === 401, `status=${r3.status}`);

  // Wrong scheme
  const r4 = await get(`${BASE}/trading/orders`, { Authorization: "Basic dXNlcjpwYXNz" });
  record("auth", "Basic auth scheme → 401", r4.status === 401, `status=${r4.status}`);

  // Tampered JWT (modify payload)
  const { token } = await createUser("tamper");
  const parts = token.split(".");
  if (parts.length === 3) {
    // Flip a character in the payload
    const tampered = parts[0] + "." + parts[1].slice(0, -1) + "X" + "." + parts[2];
    const r5 = await get(`${BASE}/trading/orders`, { Authorization: `Bearer ${tampered}` });
    record("auth", "Tampered JWT payload → 401", r5.status === 401, `status=${r5.status}`);
  }
}

// ── 2. Shadow State Isolation Tests (I1–I4) ──────────────────────────
async function shadowIsolationTests() {
  console.log("\n  ── SHADOW STATE ISOLATION (I1–I4) ──");

  // Create user, place an order in NORMAL state
  const { token } = await createUser("shadow");

  // Place order in NORMAL
  const coinsRes = await get(`${BASE}/market/coins?search=BTC`);
  const coins = await coinsRes.json() as any;
  const btcId = coins.coins?.find((c: any) => c.symbol === "BTC")?.id;

  if (btcId) {
    await post(`${BASE}/trading/orders`, { coinId: btcId, side: "BUY", type: "MARKET", quantity: 0.05 }, { Authorization: `Bearer ${token}` });

    // Verify order visible in NORMAL
    const ordersNormal = await get(`${BASE}/trading/orders`, { Authorization: `Bearer ${token}` });
    const normalData = await ordersNormal.json() as any;
    const normalCount = normalData.orders?.length ?? 0;
    record("isolation", "I3: Authentic session sees its own orders", normalCount > 0, `normalOrders=${normalCount}`);

    // Trigger SHADOW
    await post(`${BASE}/ares/signal`, {
      dwellTimeMs: 200, flightTimeMs: 520, typingSpeedCpm: 75, correctionRate: 0.40,
    }, { Authorization: `Bearer ${token}` });

    // I1: Shadow session cannot read authentic orders
    const ordersShadow = await get(`${BASE}/trading/orders`, { Authorization: `Bearer ${token}` });
    const shadowData = await ordersShadow.json() as any;
    const shadowCount = shadowData.orders?.length ?? 0;
    record("isolation", "I1: Shadow session cannot read authentic orders", shadowCount === 0, `shadowOrders=${shadowCount}`);

    // I2: Place order in SHADOW, verify it doesn't appear when we check total
    await post(`${BASE}/trading/orders`, { coinId: btcId, side: "BUY", type: "MARKET", quantity: 0.01 }, { Authorization: `Bearer ${token}` });
    const ordersShadow2 = await get(`${BASE}/trading/orders`, { Authorization: `Bearer ${token}` });
    const shadowData2 = await ordersShadow2.json() as any;
    const shadowCount2 = shadowData2.orders?.length ?? 0;
    record("isolation", "I2: Shadow writes go to shadow-scoped records", shadowCount2 >= 1, `shadowOrders=${shadowCount2}`);

    // I4: Sending a NORMAL signal shouldn't undo SHADOW
    await post(`${BASE}/ares/signal`, {
      dwellTimeMs: 110, flightTimeMs: 175, typingSpeedCpm: 250, correctionRate: 0.05,
    }, { Authorization: `Bearer ${token}` });

    const sessionRes = await get(`${BASE}/session/me`, { Authorization: `Bearer ${token}` });
    const sessionData = await sessionRes.json() as any;
    const stateAfter = sessionData.session?.state ?? sessionData.state;
    record("isolation", "I4: Shadow transition is irreversible (NORMAL signal doesn't undo it)", stateAfter === "SHADOW", `stateAfterNormalSignal=${stateAfter}`);
  } else {
    record("isolation", "SKIP: BTC not found in market data", false, "Cannot test isolation without BTC coin");
  }
}

// ── 3. Input Validation Fuzzing ──────────────────────────────────────
async function inputFuzzingTests() {
  console.log("\n  ── INPUT VALIDATION FUZZING ──");

  const { token } = await createUser("fuzz");

  const fuzzCases: { name: string; body: unknown }[] = [
    { name: "NaN values", body: { dwellTimeMs: NaN, flightTimeMs: NaN } },
    { name: "Infinity values", body: { dwellTimeMs: Infinity, flightTimeMs: -Infinity } },
    { name: "Negative values", body: { dwellTimeMs: -100, flightTimeMs: -500, typingSpeedCpm: -1 } },
    { name: "Null signal fields", body: { dwellTimeMs: null, flightTimeMs: null } },
    { name: "Zero values", body: { dwellTimeMs: 0, flightTimeMs: 0, typingSpeedCpm: 0, correctionRate: 0 } },
    { name: "Extreme large values", body: { dwellTimeMs: 999999, flightTimeMs: 999999, typingSpeedCpm: 999999 } },
    { name: "Empty object", body: {} },
    { name: "String instead of number", body: { dwellTimeMs: "abc", flightTimeMs: "xyz" } },
    { name: "Array instead of object", body: [1, 2, 3] },
    { name: "Massive string field", body: { dwellTimeMs: 100, context: { deviceType: "x".repeat(10000) } } },
  ];

  for (const { name, body } of fuzzCases) {
    try {
      const res = await post(`${BASE}/ares/signal`, body, { Authorization: `Bearer ${token}` });
      // Any response (200 or 4xx) is acceptable as long as the server doesn't crash
      const ok = res.status < 500;
      record("fuzzing", `${name} → no server crash`, ok, `status=${res.status}`);
    } catch (err: any) {
      record("fuzzing", `${name} → no server crash`, false, `error=${err.message}`);
    }
  }
}

// ── 4. Secret Exposure Checks ────────────────────────────────────────
async function secretExposureTests() {
  console.log("\n  ── SECRET EXPOSURE CHECKS ──");

  const email = `sec_leak_${Date.now()}@test.com`;
  const password = "LeakTest123!";

  const regRes = await post(`${BASE}/auth/register`, { email, password, displayName: "LeakTest" });
  const regBody = JSON.stringify(await regRes.json());
  record("secrets", "Register response doesn't contain password", !regBody.includes(password), "checked response body");
  record("secrets", "Register response doesn't contain 'JWT_SECRET'", !regBody.includes("JWT_SECRET"), "checked response body");

  const loginRes = await post(`${BASE}/auth/login`, { email, password });
  const loginBody = JSON.stringify(await loginRes.json());
  record("secrets", "Login response doesn't contain password", !loginBody.includes(password), "checked response body");
  record("secrets", "Login response doesn't expose password hash", !loginBody.includes("$2b$") && !loginBody.includes("$argon"), "no bcrypt/argon hash in response");
}

// ── Run all ──────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(76));
  console.log("  A3.4 — SYSTEMATIC SECURITY TESTING");
  console.log("=".repeat(76));

  try {
    await authBypassTests();
    await shadowIsolationTests();
    await inputFuzzingTests();
    await secretExposureTests();
  } catch (err: any) {
    console.error(`\n  FATAL: ${err.message}`);
    if (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED")) {
      console.error("  → Server must be running on port 4000. Start it with: npx tsx src/server.ts");
    }
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n${"─".repeat(76)}`);
  console.log(`  SUMMARY: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${"─".repeat(76)}`);

  const outputPath = join(__dirname, "..", "..", "..", "docs", "security-results.json");
  writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed },
    results,
  }, null, 2), "utf-8");
  console.log(`  ✓ Results saved to docs/security-results.json`);
  console.log("=".repeat(76));
}

main();
