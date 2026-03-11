import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { api } from "../convex/_generated/api";

// Load environment variables
const isProd = process.argv.includes("--prod");
const envFile = isProd ? ".env.production" : ".env.local";
dotenv.config({ path: envFile });

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;

if (!convexUrl) {
  console.error("❌ Error: NEXT_PUBLIC_CONVEX_URL is missing from .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

async function main() {
  console.log(`🚀 Loading users from JSON...`);
  
  // 1. Read the local JSON file securely
  const usersRaw = fs.readFileSync(path.join(__dirname, "data/users.json"), "utf8");
  const usersData = JSON.parse(usersRaw);

  console.log(`📦 Loaded ${usersData.staff.length} staff and ${usersData.students.length} students.`);
  console.log(`🚀 Triggering Convex Migration Action...`);

  // 2. Call the Convex action and pass the data
  const result = await client.action(api.seedCPCA.runMigration, {
    staff: usersData.staff,
    students: usersData.students,
  });

  // 3. Output the results
  console.log(`\n========================================`);
  console.log(`✅ SCHOOL_ID created: ${result.schoolId}`);
  console.log(`✅ CAMPUS_ID created: ${result.campusId}`);
  console.log(`========================================\n`);
  
  console.log("✨ Migration Complete! Please copy the SCHOOL_ID above to your .env.local");
}

main().catch(console.error);