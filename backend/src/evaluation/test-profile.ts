/* ── test-profile.ts ───────────────────────────────────────────────────
   Automated verification of User Profile endpoints:
   1. Registration & full profile retrieval (GET /api/user/profile)
   2. Modifying personal details (Name and User ID) (PUT /api/user/profile)
   3. Uniqueness enforcement on User ID
   4. Security Invariant: Rejection of attempts to modify locked fields (Mobile, Email, PAN, Role, etc.)
   5. KYC Submission & Locked KYC Data retrieval in Profile
   ──────────────────────────────────────────────────────────────────── */

import { createApp } from "../app";
import { Server } from "http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { hashToken } from "../middleware/auth.middleware";

async function runProfileTests() {
  console.log("==================================================");
  console.log("  USER PROFILE & IDENTITY MANAGEMENT TEST SUITE   ");
  console.log("==================================================\n");

  const app = createApp();
  const PORT = 4199;
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(PORT, () => resolve(s));
  });

  const BASE = `http://localhost:${PORT}/api`;

  try {
    // 1. Create a test user with KYC & active session
    const timestamp = Date.now();
    const email = `profile_test_${timestamp}@example.com`;
    const phone = "+91 98765 43210";
    const displayName = "Original Name";
    const password = "TestPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        phone,
        displayName,
        passwordHash,
        kycStatus: "VERIFIED",
        kycDataJson: JSON.stringify({
          fullName: "Original Name",
          panNumber: "ABCDE1234F",
          aadhaarLast4: "5678",
          paymentMethod: "UPI",
          upiId: "original@okhdfcbank",
          verifiedAt: new Date().toISOString(),
        }),
        kycVerifiedAt: new Date(),
      },
    });

    // Create wallet for user
    await prisma.wallet.create({
      data: {
        userId: user.id,
        isShadow: false,
        address: `devnet:test-${timestamp}`,
        chain: "devnet",
      },
    });

    // Create active session and token
    const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: "1h" });
    const tokenHash = hashToken(token);

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // ── Test 1: GET /api/user/profile ─────────────────────────────
    console.log("[Test 1] Fetching full registered profile...");
    const getRes = await fetch(`${BASE}/user/profile`, { headers: authHeaders });
    if (!getRes.ok) throw new Error(`GET /user/profile failed with status ${getRes.status}`);

    const getData = (await getRes.json()) as any;
    console.log("  ✓ Status: 200 OK");
    console.log(`  ✓ Display Name: "${getData.profile.displayName}"`);
    console.log(`  ✓ Registered Phone: "${getData.profile.phone}"`);
    console.log(`  ✓ KYC Status: "${getData.profile.kycStatus}"`);
    console.log(`  ✓ Locked PAN: "${getData.profile.kycData?.panNumber}"`);
    console.log(`  ✓ Locked Aadhaar: "${getData.profile.kycData?.aadhaarLast4}"`);
    console.log(`  ✓ Locked UPI: "${getData.profile.kycData?.upiId}"`);

    if (getData.profile.displayName !== "Original Name") throw new Error("Incorrect display name");
    if (getData.profile.phone !== "+91 98765 43210") throw new Error("Incorrect phone number");
    if (getData.profile.kycData?.panNumber !== "ABCDE1234F") throw new Error("Incorrect PAN");
    if (getData.profile.kycData?.aadhaarLast4 !== "5678") throw new Error("Incorrect Aadhaar");
    if (getData.profile.kycData?.upiId !== "original@okhdfcbank") throw new Error("Incorrect UPI");

    // ── Test 2: PUT /api/user/profile (Modify Name and User ID) ────
    console.log("\n[Test 2] Updating personal details (Name & User ID)...");
    const updatedUsername = `trader_${timestamp}`;
    const updateRes = await fetch(`${BASE}/user/profile`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        displayName: "Ganesh Allu (Pro)",
        username: updatedUsername,
      }),
    });

    if (!updateRes.ok) throw new Error(`PUT /user/profile failed: ${await updateRes.text()}`);
    const updateData = (await updateRes.json()) as any;
    console.log("  ✓ Status: 200 OK");
    console.log(`  ✓ Updated Name: "${updateData.user.displayName}"`);
    console.log(`  ✓ Updated User ID: "@${updateData.user.username}"`);

    if (updateData.user.displayName !== "Ganesh Allu (Pro)") throw new Error("Name was not updated");
    if (updateData.user.username !== updatedUsername.toLowerCase()) throw new Error("User ID was not updated");

    // ── Test 3: Security Invariant — Rejection of Immutable Fields ──
    console.log("\n[Test 3] Testing Security Invariant (Tamper-proofing immutable KYC/identity fields)...");
    const tamperRes = await fetch(`${BASE}/user/profile`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        displayName: "Valid Name",
        phone: "+1 000 000 0000", // Tampering attempt
        panNumber: "HACKED9999",   // Tampering attempt
        role: "ADMIN",             // Privilege escalation attempt
      }),
    });

    if (tamperRes.status === 400) {
      const tamperData = (await tamperRes.json()) as any;
      console.log("  ✓ Passed: Server rejected tampering with 400 Bad Request");
      console.log(`  ✓ Security Message: "${tamperData.message}"`);
      console.log(`  ✓ Blocked Fields: ${tamperData.immutableFields?.join(", ")}`);
    } else {
      throw new Error(`Expected 400 Bad Request for immutable fields tampering, got ${tamperRes.status}`);
    }

    // ── Test 4: Uniqueness check on User ID ───────────────────────
    console.log("\n[Test 4] Testing User ID uniqueness conflict handling...");
    // Create second user
    const secondUser = await prisma.user.create({
      data: {
        email: `second_${timestamp}@example.com`,
        phone: "+91 91111 22222",
        passwordHash,
      },
    });
    const secondToken = jwt.sign({ userId: secondUser.id, email: secondUser.email }, env.JWT_SECRET, { expiresIn: "1h" });
    await prisma.session.create({
      data: {
        userId: secondUser.id,
        tokenHash: hashToken(secondToken),
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    // Try to take the first user's username
    const conflictRes = await fetch(`${BASE}/user/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secondToken}`,
      },
      body: JSON.stringify({
        username: updatedUsername,
      }),
    });

    if (conflictRes.status === 400) {
      const conflictData = (await conflictRes.json()) as any;
      console.log("  ✓ Passed: Server rejected duplicate User ID with 400 Bad Request");
      console.log(`  ✓ Error: "${conflictData.error}" - "${conflictData.message}"`);
    } else {
      throw new Error(`Expected 400 for duplicate User ID, got ${conflictRes.status}`);
    }

    // ── Test 5: Verify profile persistence ─────────────────────────
    console.log("\n[Test 5] Verifying persistent profile state...");
    const verifyRes = await fetch(`${BASE}/user/profile`, { headers: authHeaders });
    const verifyData = (await verifyRes.json()) as any;

    if (verifyData.profile.displayName !== "Ganesh Allu (Pro)") throw new Error("Display name did not persist");
    if (verifyData.profile.username !== updatedUsername.toLowerCase()) throw new Error("Username did not persist");
    if (verifyData.profile.phone !== "+91 98765 43210") throw new Error("Phone was improperly modified");
    if (verifyData.profile.kycData.panNumber !== "ABCDE1234F") throw new Error("PAN was improperly modified");

    console.log("  ✓ Verified: Personal details persisted, locked KYC fields remained 100% intact.");
    console.log("\n==================================================");
    console.log("  🎉 ALL 5 USER PROFILE TESTS PASSED SUCCESSFULLY! ");
    console.log("==================================================\n");
  } finally {
    server.close();
  }
}

runProfileTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
