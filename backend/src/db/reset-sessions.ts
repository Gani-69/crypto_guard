import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetSessions() {
  // Reset all sessions to NORMAL so the user can use the app
  const result = await prisma.session.updateMany({
    where: {
      state: { not: "NORMAL" },
      revokedAt: null,
    },
    data: { state: "NORMAL" },
  });

  console.log(`Reset ${result.count} session(s) back to NORMAL state.`);
  console.log("You can now browse the app without the verification modal.");
  console.log("To trigger ARES, go to Security → select a simulation profile → type on any page.");
  
  await prisma.$disconnect();
}

resetSessions().catch((e) => {
  console.error(e);
  process.exit(1);
});
