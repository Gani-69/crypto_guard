import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

const prisma = new PrismaClient();

// ── Synthetic 7-day price history generator ──────────────────────────
function generatePriceHistory(
  currentPrice: number,
  volatility: number = 0.03, // 3% daily volatility
  days: number = 7,
  pointsPerDay: number = 24
): { timestamp: number; price: number }[] {
  const points: { timestamp: number; price: number }[] = [];
  const totalPoints = days * pointsPerDay;
  const now = Date.now();
  const msPerPoint = (days * 24 * 60 * 60 * 1000) / totalPoints;

  // Walk backwards from current price using geometric Brownian motion
  let price = currentPrice;
  const prices: number[] = [price];
  for (let i = 1; i < totalPoints; i++) {
    const drift = (Math.random() - 0.48) * volatility; // slight upward bias
    price = price / (1 + drift);
    prices.unshift(price);
  }

  for (let i = 0; i < totalPoints; i++) {
    points.push({
      timestamp: now - (totalPoints - 1 - i) * msPerPoint,
      price: Math.max(prices[i], 0.0001),
    });
  }

  return points;
}

// ── Coin data (realistic as of mid-2026) ─────────────────────────────
const COINS = [
  { symbol: "BTC", name: "Bitcoin", price: 104250, cap: 2070000000000, vol: 38000000000, change: 2.35, rank: 1, trending: true, volatility: 0.02 },
  { symbol: "ETH", name: "Ethereum", price: 3320, cap: 399000000000, vol: 17000000000, change: 3.12, rank: 2, trending: true, volatility: 0.03 },
  { symbol: "BNB", name: "BNB", price: 685, cap: 99700000000, vol: 1800000000, change: -0.45, rank: 3, trending: false, volatility: 0.025 },
  { symbol: "SOL", name: "Solana", price: 178, cap: 85000000000, vol: 3200000000, change: 5.67, rank: 4, trending: true, volatility: 0.04 },
  { symbol: "XRP", name: "XRP", price: 0.62, cap: 34500000000, vol: 1200000000, change: -1.22, rank: 5, trending: false, volatility: 0.035 },
  { symbol: "ADA", name: "Cardano", price: 0.48, cap: 17200000000, vol: 420000000, change: 1.87, rank: 6, trending: false, volatility: 0.04 },
  { symbol: "DOGE", name: "Dogecoin", price: 0.165, cap: 23700000000, vol: 1100000000, change: 4.21, rank: 7, trending: true, volatility: 0.06 },
  { symbol: "AVAX", name: "Avalanche", price: 38.5, cap: 15800000000, vol: 580000000, change: -2.15, rank: 8, trending: false, volatility: 0.045 },
  { symbol: "DOT", name: "Polkadot", price: 7.85, cap: 11200000000, vol: 320000000, change: 0.92, rank: 9, trending: false, volatility: 0.04 },
  { symbol: "MATIC", name: "Polygon", price: 0.72, cap: 7100000000, vol: 380000000, change: -0.34, rank: 10, trending: false, volatility: 0.05 },
  { symbol: "LINK", name: "Chainlink", price: 18.2, cap: 10800000000, vol: 620000000, change: 3.45, rank: 11, trending: true, volatility: 0.04 },
  { symbol: "UNI", name: "Uniswap", price: 11.35, cap: 6900000000, vol: 210000000, change: 1.56, rank: 12, trending: false, volatility: 0.045 },
  { symbol: "ATOM", name: "Cosmos", price: 9.42, cap: 3600000000, vol: 180000000, change: -0.78, rank: 13, trending: false, volatility: 0.04 },
  { symbol: "LTC", name: "Litecoin", price: 88.5, cap: 6500000000, vol: 420000000, change: 0.23, rank: 14, trending: false, volatility: 0.03 },
  { symbol: "FIL", name: "Filecoin", price: 5.85, cap: 3200000000, vol: 160000000, change: -3.12, rank: 15, trending: false, volatility: 0.05 },
  { symbol: "NEAR", name: "NEAR Protocol", price: 5.12, cap: 5700000000, vol: 280000000, change: 6.78, rank: 16, trending: true, volatility: 0.05 },
  { symbol: "APT", name: "Aptos", price: 9.25, cap: 4200000000, vol: 220000000, change: 2.34, rank: 17, trending: false, volatility: 0.045 },
  { symbol: "ARB", name: "Arbitrum", price: 1.18, cap: 3800000000, vol: 310000000, change: -1.45, rank: 18, trending: false, volatility: 0.05 },
  { symbol: "OP", name: "Optimism", price: 2.45, cap: 2900000000, vol: 190000000, change: 1.89, rank: 19, trending: false, volatility: 0.05 },
  { symbol: "SUI", name: "Sui", price: 1.52, cap: 4800000000, vol: 340000000, change: 8.92, rank: 20, trending: true, volatility: 0.06 },
];

// ── Main seed ────────────────────────────────────────────────────────
async function main() {
  const coinCount = await prisma.coin.count();
  if (coinCount > 0) {
    console.log("[seed] Database already has coins. Upserting user records only...");
    // F1/F4 upsert: ensure demo user has phone and admin user exists,
    // without wiping market data or holdings.
    const defaultPhone = process.env.SEED_TEST_PHONE || "+10000000000";
    const adminHash = await bcrypt.hash("admin1234", 10);
    await prisma.user.upsert({
      where: { email: "admin@cryptoguard.dev" },
      update: { phone: defaultPhone, role: "ADMIN" },
      create: {
        email: "admin@cryptoguard.dev",
        phone: defaultPhone,
        passwordHash: adminHash,
        displayName: "System Admin",
        role: "ADMIN",
      },
    });
    await prisma.user.updateMany({
      where: { email: "demo@cryptoguard.dev" },
      data: { phone: defaultPhone },
    });
    console.log("[seed]   → admin@cryptoguard.dev upserted (password: admin1234)");
    console.log("[seed]   → demo user phone updated");
    return;
  }

  console.log("[seed] Clearing existing data...");
  // Delete in order respecting foreign keys
  await prisma.transaction.deleteMany();
  await prisma.order.deleteMany();
  await prisma.holding.deleteMany();
  await prisma.watchlistItem.deleteMany();
  await prisma.pinCheckLog.deleteMany();      // F3
  await prisma.adminAccessLog.deleteMany();   // F4
  await prisma.webAuthnCredential.deleteMany(); // F5
  await prisma.policyDecision.deleteMany();
  await prisma.riskEvent.deleteMany();
  await prisma.behavioralEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.coin.deleteMany();
  await prisma.user.deleteMany();

  // ── Coins ──
  console.log("[seed] Creating coins...");
  const coinRecords = [];
  for (const c of COINS) {
    const history = generatePriceHistory(c.price, c.volatility);
    const coin = await prisma.coin.create({
      data: {
        symbol: c.symbol,
        name: c.name,
        priceUsd: c.price,
        marketCapUsd: c.cap,
        volume24hUsd: c.vol,
        change24hPct: c.change,
        rank: c.rank,
        isTrending: c.trending,
        priceHistory7d: JSON.stringify(history),
      },
    });
    coinRecords.push(coin);
  }
  console.log(`[seed]   → ${coinRecords.length} coins created`);

  // ── Demo user ──
  console.log("[seed] Creating demo user...");
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const user = await prisma.user.create({
    data: {
      email: "demo@cryptoguard.dev",
      phone: process.env.SEED_TEST_PHONE || "+10000000000",  // F1: placeholder phone for seed data (override with SEED_TEST_PHONE)
      passwordHash,
      displayName: "Demo User",
      role: "USER",
    },
  });
  console.log(`[seed]   → user ${user.email} (password: demo1234)`);

  // ── Real wallet with holdings ──
  console.log("[seed] Creating real wallet...");
  const realWallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      isShadow: false,
      address: `devnet:${uuid().slice(0, 16)}`,
      chain: "devnet",
    },
  });

  // Give the demo user some holdings
  const realHoldings = [
    { symbol: "BTC", amount: 0.45 },
    { symbol: "ETH", amount: 5.2 },
    { symbol: "SOL", amount: 42 },
    { symbol: "LINK", amount: 150 },
    { symbol: "DOT", amount: 280 },
  ];

  for (const h of realHoldings) {
    const coin = coinRecords.find((c) => c.symbol === h.symbol)!;
    await prisma.holding.create({
      data: {
        walletId: realWallet.id,
        coinId: coin.id,
        amount: h.amount,
      },
    });
  }

  // Add some demo transactions
  const btc = coinRecords.find((c) => c.symbol === "BTC")!;
  const eth = coinRecords.find((c) => c.symbol === "ETH")!;
  const sol = coinRecords.find((c) => c.symbol === "SOL")!;

  const demoTransactions = [
    { coin: btc, type: "BUY" as const, amount: 0.25, priceUsd: 98500, daysAgo: 6 },
    { coin: eth, type: "BUY" as const, amount: 3.0, priceUsd: 3100, daysAgo: 5 },
    { coin: sol, type: "BUY" as const, amount: 20, priceUsd: 162, daysAgo: 4 },
    { coin: btc, type: "BUY" as const, amount: 0.2, priceUsd: 101000, daysAgo: 3 },
    { coin: eth, type: "BUY" as const, amount: 2.2, priceUsd: 3250, daysAgo: 2 },
    { coin: sol, type: "BUY" as const, amount: 22, priceUsd: 170, daysAgo: 1 },
  ];

  for (const tx of demoTransactions) {
    const createdAt = new Date(Date.now() - tx.daysAgo * 24 * 60 * 60 * 1000);
    await prisma.transaction.create({
      data: {
        walletId: realWallet.id,
        coinId: tx.coin.id,
        type: tx.type,
        amount: tx.amount,
        priceUsd: tx.priceUsd,
        isShadow: false,
        createdAt,
      },
    });
  }

  console.log(`[seed]   → real wallet with ${realHoldings.length} holdings, ${demoTransactions.length} transactions`);

  // ── Shadow wallet (for Block E — pre-seed it now so there's data when Shadow is wired) ──
  console.log("[seed] Creating shadow wallet...");
  const shadowWallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      isShadow: true,
      address: `devnet:shadow-${uuid().slice(0, 12)}`,
      chain: "devnet",
    },
  });

  // Shadow has a small, plausible-looking portfolio (not empty — per prior-art guidance)
  const shadowHoldings = [
    { symbol: "BTC", amount: 0.02 },
    { symbol: "ETH", amount: 0.5 },
  ];

  for (const h of shadowHoldings) {
    const coin = coinRecords.find((c) => c.symbol === h.symbol)!;
    await prisma.holding.create({
      data: {
        walletId: shadowWallet.id,
        coinId: coin.id,
        amount: h.amount,
      },
    });
  }
  console.log(`[seed]   → shadow wallet with ${shadowHoldings.length} holdings`);

  // ── Watchlist ──
  console.log("[seed] Creating watchlist...");
  const watchlistCoins = ["DOGE", "NEAR", "SUI", "AVAX"];
  for (const sym of watchlistCoins) {
    const coin = coinRecords.find((c) => c.symbol === sym)!;
    await prisma.watchlistItem.create({
      data: {
        userId: user.id,
        coinId: coin.id,
      },
    });
  }
  console.log(`[seed]   → ${watchlistCoins.length} watchlist items`);

  // ── Admin user (F4) ──────────────────────────────────────────────────
  // DEV-ONLY: creates admin@cryptoguard.dev with role=ADMIN.
  // This account is NOT suitable for production use — it uses a hardcoded
  // password and has no real authentication hardening beyond the demo flow.
  console.log("[seed] Creating admin user (dev-only)...");
  const adminPasswordHash = await bcrypt.hash("admin1234", 10);
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@cryptoguard.dev",
      phone: process.env.SEED_TEST_PHONE || "+10000000000",
      passwordHash: adminPasswordHash,
      displayName: "Admin",
      role: "ADMIN",  // F4: RBAC role
    },
  });
  // Pre-create wallets for the admin account (same pattern as demo user)
  await prisma.wallet.create({
    data: {
      userId: adminUser.id,
      isShadow: false,
      address: `devnet:admin-${uuid().slice(0, 12)}`,
      chain: "devnet",
    },
  });
  await prisma.wallet.create({
    data: {
      userId: adminUser.id,
      isShadow: true,
      address: `devnet:admin-shadow-${uuid().slice(0, 8)}`,
      chain: "devnet",
    },
  });
  console.log(`[seed]   → admin ${adminUser.email} (password: admin1234, role: ADMIN)`);

  console.log("[seed] Done ✓");
}

main()
  .catch((e) => {
    console.error("[seed] Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
