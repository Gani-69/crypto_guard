import { v4 as uuid } from "uuid";

async function runE2ETest() {
  const email = `e2e_test_${Date.now()}@example.com`;
  const password = "password123!";
  const baseURL = "http://localhost:4000/api";

  console.log(`Starting E2E Integration test for user: ${email}\n`);

  // 1. Register User
  console.log("[Step 1] Registering user...");
  const regRes = await fetch(`${baseURL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "E2E Agent" }),
  });

  if (!regRes.ok) {
    throw new Error(`Registration failed: ${regRes.status} ${await regRes.text()}`);
  }
  const regData = await regRes.json();
  console.log(`  ✓ Registered user ID: ${regData.user.id}`);

  // 2. Login User
  console.log("\n[Step 2] Logging in...");
  const loginRes = await fetch(`${baseURL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log(`  ✓ Logged in. Token issued.`);
  console.log(`  ✓ Initial session state: ${loginData.session.state}`);
  if (loginData.session.state !== "NORMAL") {
    throw new Error(`Expected initial session state to be NORMAL, got: ${loginData.session.state}`);
  }

  // 3. Fetch Coins to get BTC ID
  console.log("\n[Step 3] Fetching BTC coin ID...");
  const coinsRes = await fetch(`${baseURL}/market/coins?search=BTC`);
  if (!coinsRes.ok) {
    throw new Error(`Failed to fetch coins: ${coinsRes.status}`);
  }
  const coinsData = await coinsRes.json();
  const btcCoin = coinsData.coins.find((c: any) => c.symbol === "BTC");
  if (!btcCoin) {
    throw new Error("BTC coin not found in market data");
  }
  const btcId = btcCoin.id;
  console.log(`  ✓ Found BTC Coin ID: ${btcId}`);

  // 4. Place a Buy Order in NORMAL state
  console.log("\n[Step 4] Placing Buy Order (0.1 BTC) in NORMAL state...");
  const orderRes = await fetch(`${baseURL}/trading/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      coinId: btcId,
      side: "BUY",
      type: "MARKET",
      quantity: 0.1,
    }),
  });

  if (!orderRes.ok) {
    throw new Error(`Order placement failed: ${orderRes.status} ${await orderRes.text()}`);
  }
  const orderData = await orderRes.json();
  const orderId = orderData.order.id;
  console.log(`  ✓ Order placed successfully. Order ID: ${orderId}`);

  // 5. Verify Order history in NORMAL state
  console.log("\n[Step 5] Querying orders in NORMAL state...");
  const getOrdersRes1 = await fetch(`${baseURL}/trading/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getOrdersRes1.ok) {
    throw new Error(`Failed to fetch orders: ${getOrdersRes1.status}`);
  }
  const ordersData1 = await getOrdersRes1.json();
  console.log(`  ✓ Found ${ordersData1.orders.length} order(s)`);
  const hasOrder = ordersData1.orders.some((o: any) => o.id === orderId);
  if (!hasOrder) {
    throw new Error("Expected to find the placed order in NORMAL state orders list");
  }
  console.log("  ✓ Placed order exists in NORMAL session history");

  // 6. Trigger ARES Duress/Coerced Signal
  console.log("\n[Step 6] Submitting ARES duress/coerced behavioral signal...");
  // COERCED signal is slow, high correction, high flight time
  const signalRes = await fetch(`${baseURL}/ares/signal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      dwellTimeMs: 200,
      flightTimeMs: 520,
      typingSpeedCpm: 75,
      correctionRate: 0.40,
    }),
  });

  if (!signalRes.ok) {
    throw new Error(`Failed to send signal: ${signalRes.status}`);
  }
  const signalData = await signalRes.json();
  console.log(`  ✓ Baseline model decision: ${signalData.models.baseline.decision}`);
  console.log(`  ✓ ML model decision:       ${signalData.models.ml.decision}`);
  console.log(`  ✓ Neural model decision:   ${signalData.models.neural.decision}`);
  console.log(`  ✓ Current Session State updated to: ${signalData.sessionState}`);
  if (!signalData.models.neural) {
    throw new Error("Neural model result missing from signal response — A2 integration incomplete");
  }
  if (signalData.sessionState !== "SHADOW") {
    throw new Error(`Expected session state to transition to SHADOW, got: ${signalData.sessionState}`);
  }

  // 7. Verify Order history in SHADOW state
  console.log("\n[Step 7] Querying orders in SHADOW state...");
  const getOrdersRes2 = await fetch(`${baseURL}/trading/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getOrdersRes2.ok) {
    throw new Error(`Failed to fetch orders: ${getOrdersRes2.status}`);
  }
  const ordersData2 = await getOrdersRes2.json();
  console.log(`  ✓ Found ${ordersData2.orders.length} order(s) in SHADOW session`);
  const hasOrderInShadow = ordersData2.orders.some((o: any) => o.id === orderId);
  if (hasOrderInShadow) {
    throw new Error("SECURITY FAILURE: NORMAL order is visible under SHADOW session state!");
  }
  console.log("  ✓ NORMAL order is completely isolated and invisible in SHADOW mode");

  // 8. Attempt to cancel NORMAL order under SHADOW session
  console.log("\n[Step 8] Attempting to cancel NORMAL order ID using SHADOW session...");
  const cancelRes = await fetch(`${baseURL}/trading/orders/${orderId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(`  ✓ Server response code: ${cancelRes.status}`);
  const cancelData = await cancelRes.json();
  console.log(`  ✓ Server error body:`, cancelData);
  if (cancelRes.ok || cancelData.error !== "Order not found") {
    throw new Error(`SECURITY FAILURE: expected cancellation to fail with 'Order not found', got status ${cancelRes.status} and error: ${JSON.stringify(cancelData)}`);
  }
  console.log("  ✓ Order cancellation successfully blocked with 'Order not found' error");

  // 9. Verify Manual Duress Gesture at Login
  console.log("\n[Step 9] Verifying Manual Duress Gesture at login...");
  const emailDuress = `e2e_duress_${Date.now()}@example.com`;

  // Register new duress user
  const regResDuress = await fetch(`${baseURL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailDuress, password, displayName: "Duress Agent" }),
  });
  if (!regResDuress.ok) {
    throw new Error(`Duress registration failed: ${regResDuress.status} ${await regResDuress.text()}`);
  }
  console.log(`  ✓ Registered duress user`);

  // Login with manualDuressSignal
  const loginResDuress = await fetch(`${baseURL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: emailDuress,
      password,
      signal: {
        dwellTimeMs: 110,
        flightTimeMs: 170,
        typingSpeedCpm: 230,
        correctionRate: 0.04,
        manualDuressSignal: true
      }
    }),
  });
  if (!loginResDuress.ok) {
    throw new Error(`Duress login failed: ${loginResDuress.status} ${await loginResDuress.text()}`);
  }
  const loginDataDuress = await loginResDuress.json();
  console.log(`  ✓ Duress login session state: ${loginDataDuress.session.state}`);
  if (loginDataDuress.session.state !== "SHADOW") {
    throw new Error(`Expected manual duress session to start in SHADOW, got: ${loginDataDuress.session.state}`);
  }
  console.log("  ✓ Manual duress gesture successfully triggered SHADOW state on login");

  console.log("\n" + "=".repeat(60));
  console.log("   E2E ISOLATION AND SHADOW RUN PASSED SUCCESSFULLY!");
  console.log("=".repeat(60));
}

runE2ETest().catch((err) => {
  console.error("\n❌ E2E TEST FAILED:", err.message);
  process.exit(1);
});
