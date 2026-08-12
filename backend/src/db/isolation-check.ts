import { PrismaClient } from "@prisma/client";
import { placeOrder } from "../services/trading.service";

const prisma = new PrismaClient();

async function runIsolationCheck() {
  console.log("==================================================================");
  console.log("     ARES POLICY DEGRADATION: SHADOW STATE ISOLATION CHECK        ");
  console.log("==================================================================");

  try {
    // 1. Fetch Demo User
    const user = await prisma.user.findFirst({
      where: { email: "demo@cryptoguard.dev" },
    });

    if (!user) {
      console.error("[TEST ERROR] Demo user demo@cryptoguard.dev not found. Please run seed script first.");
      process.exit(1);
    }

    // 2. Fetch both wallets
    const realWallet = await prisma.wallet.findFirst({
      where: { userId: user.id, isShadow: false },
      include: { holdings: true },
    });

    const shadowWallet = await prisma.wallet.findFirst({
      where: { userId: user.id, isShadow: true },
      include: { holdings: true },
    });

    if (!realWallet || !shadowWallet) {
      console.error("[TEST ERROR] Real or shadow wallets missing for demo user.");
      process.exit(1);
    }

    console.log(`[1] User resolved: ${user.email} (ID: ${user.id})`);
    console.log(`    → Authentic Wallet Address: ${realWallet.address} (ID: ${realWallet.id})`);
    console.log(`    → Shadow Wallet Address:    ${shadowWallet.address} (ID: ${shadowWallet.id})`);

    // 3. Record baseline balances
    const btcCoin = await prisma.coin.findUnique({ where: { symbol: "BTC" } });
    if (!btcCoin) {
      console.error("[TEST ERROR] BTC Coin record missing.");
      process.exit(1);
    }

    const realBtcBaseline = realWallet.holdings.find(h => h.coinId === btcCoin.id)?.amount ?? 0;
    const shadowBtcBaseline = shadowWallet.holdings.find(h => h.coinId === btcCoin.id)?.amount ?? 0;

    console.log("\n[2] Recorded Baseline BTC Holdings:");
    console.log(`    → Authentic Wallet BTC: ${realBtcBaseline} BTC`);
    console.log(`    → Shadow Wallet BTC:    ${shadowBtcBaseline} BTC`);

    // 4. Simulate a trade inside the SHADOW state
    console.log("\n[3] Simulating BUY order inside SHADOW state session context...");
    console.log("    → Action: Place BUY order for 0.05 BTC with isShadow = true");

    const orderResult = await placeOrder({
      userId: user.id,
      coinId: btcCoin.id,
      side: "BUY",
      type: "MARKET",
      quantity: 0.05,
      isShadow: true, // Crucial parameter representing SHADOW state write routing
    });

    console.log(`    → Order Result Message: "${orderResult.message}"`);
    console.log(`    → Order ID: ${orderResult.order.id} | Status: ${orderResult.order.status}`);

    // 5. Query updated wallet holdings
    const updatedRealWallet = await prisma.wallet.findFirst({
      where: { id: realWallet.id },
      include: { holdings: true },
    });

    const updatedShadowWallet = await prisma.wallet.findFirst({
      where: { id: shadowWallet.id },
      include: { holdings: true },
    });

    const realBtcAfter = updatedRealWallet?.holdings.find(h => h.coinId === btcCoin.id)?.amount ?? 0;
    const shadowBtcAfter = updatedShadowWallet?.holdings.find(h => h.coinId === btcCoin.id)?.amount ?? 0;

    console.log("\n[4] Querying Post-Trade BTC Holdings:");
    console.log(`    → Authentic Wallet BTC: ${realBtcAfter} BTC`);
    console.log(`    → Shadow Wallet BTC:    ${shadowBtcAfter} BTC`);

    // 6. Query order and transaction isolation flags
    const testOrder = await prisma.order.findUnique({
      where: { id: orderResult.order.id },
    });
    
    const testTx = await prisma.transaction.findFirst({
      where: { orderId: orderResult.order.id },
    });

    console.log("\n[5] Auditing Schema-Level Isolation Flags:");
    console.log(`    → Order Record carries isShadow = ${testOrder?.isShadow}`);
    console.log(`    → Transaction Record carries isShadow = ${testTx?.isShadow}`);

    // 7. Verify strict isolation constraints
    console.log("\n[6] Evaluating Isolation Constraints...");
    
    const authenticUntouched = Math.abs(realBtcAfter - realBtcBaseline) < 1e-6;
    const shadowUpdated = Math.abs(shadowBtcAfter - (shadowBtcBaseline + 0.05)) < 1e-6;
    const flagsIsolated = testOrder?.isShadow === true && testTx?.isShadow === true;

    console.log(`    → Constraint 1: Authentic holdings unchanged? ${authenticUntouched ? "YES (PASSED)" : "NO (FAILED)"}`);
    console.log(`    → Constraint 2: Shadow holdings incremented?   ${shadowUpdated ? "YES (PASSED)" : "NO (FAILED)"}`);
    console.log(`    → Constraint 3: Schema flags set to shadow?    ${flagsIsolated ? "YES (PASSED)" : "NO (FAILED)"}`);

    if (authenticUntouched && shadowUpdated && flagsIsolated) {
      console.log("\n==================================================================");
      console.log(" [ISOLATION TEST] PASSED. Shadow write isolation verified.       ");
      console.log("==================================================================");
    } else {
      console.log("\n==================================================================");
      console.log(" [ISOLATION TEST] FAILED. Structural isolation leak detected!    ");
      console.log("==================================================================");
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution encountered an error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runIsolationCheck();
