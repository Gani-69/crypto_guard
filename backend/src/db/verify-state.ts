import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verify() {
  const coins = await prisma.coin.count();
  const users = await prisma.user.count();
  const wallets = await prisma.wallet.count();
  const sessions = await prisma.session.count();
  const orders = await prisma.order.count();
  const txs = await prisma.transaction.count();
  const behavioral = await prisma.behavioralEvent.count();
  const risk = await prisma.riskEvent.count();
  const policy = await prisma.policyDecision.count();
  const watchlist = await prisma.watchlistItem.count();
  const holdings = await prisma.holding.count();

  console.log("=== CryptoGuard Database State ===");
  console.log(`Coins:             ${coins}`);
  console.log(`Users:             ${users}`);
  console.log(`Wallets:           ${wallets}`);
  console.log(`Holdings:          ${holdings}`);
  console.log(`Sessions:          ${sessions}`);
  console.log(`Orders:            ${orders}`);
  console.log(`Transactions:      ${txs}`);
  console.log(`BehavioralEvents:  ${behavioral}`);
  console.log(`RiskEvents:        ${risk}`);
  console.log(`PolicyDecisions:   ${policy}`);
  console.log(`WatchlistItems:    ${watchlist}`);

  // Check shadow isolation
  const realWallets = await prisma.wallet.count({ where: { isShadow: false } });
  const shadowWallets = await prisma.wallet.count({ where: { isShadow: true } });
  console.log(`\n--- Shadow Isolation ---`);
  console.log(`Real Wallets:      ${realWallets}`);
  console.log(`Shadow Wallets:    ${shadowWallets}`);

  // Check demo user
  const demo = await prisma.user.findFirst({ where: { email: "demo@cryptoguard.dev" } });
  if (demo) {
    console.log(`\nDemo user found: ${demo.email} (${demo.id})`);
    const demoHoldings = await prisma.holding.findMany({
      where: { wallet: { userId: demo.id, isShadow: false } },
      include: { coin: { select: { symbol: true } } },
    });
    console.log("Demo real holdings:");
    for (const h of demoHoldings) {
      console.log(`  ${h.coin.symbol}: ${h.amount}`);
    }
  }

  await prisma.$disconnect();
}

verify().catch((e) => {
  console.error(e);
  process.exit(1);
});
