/**
 * Reconciliation script — heals corrupted Clerk public_metadata.roles
 * for all users by rebuilding from the Convex roleAssignments table.
 *
 * Run once to fix students who were redirected to /pending-role after
 * their metadata was overwritten by the grade/school update bug.
 *
 * Usage:
 *   pnpm tsx scripts/healUserRoles.ts          # local (.env.local)
 *   pnpm tsx scripts/healUserRoles.ts --prod   # production (.env.production)
 */

import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";
import { api } from "../convex/_generated/api";

const isProd = process.argv.includes("--prod");
const envFile = isProd ? ".env.production" : ".env.local";
dotenv.config({ path: envFile });

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;

if (!convexUrl) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL is missing from " + envFile);
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

async function main() {
  console.log(`🔍 Healing user roles (${isProd ? "PRODUCTION" : "local"})...`);

  const result = await client.action(api.roleAssignments.healAllUserRoles);

  console.log(`\n========================================`);
  console.log(`✅ Synced:  ${result.synced} users`);
  console.log(`⏭️  Skipped: ${result.skipped} temp users`);
  if (result.errors > 0) {
    console.log(`❌ Errors:  ${result.errors} users (check Convex logs)`);
  }
  console.log(`========================================\n`);
  console.log("✨ Heal complete! Students should now be able to log in.");
}

main().catch(console.error);
