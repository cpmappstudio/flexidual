import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { api } from "../convex/_generated/api";

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
  console.log(`🚀 Loading data from JSON...`);
  
  // 1. Read users and schedules securely
  const usersRaw = fs.readFileSync(path.join(__dirname, "data/users.json"), "utf8");
  const usersData = JSON.parse(usersRaw);
  
  const schedulesRaw = fs.readFileSync(path.join(__dirname, "data/schedules.json"), "utf8");
  const schedulesData = JSON.parse(schedulesRaw);

  console.log(`📦 Loaded ${usersData.staff.length} staff, ${usersData.students.length} students, and ${schedulesData.classes.length} classes.`);
  console.log(`🚀 Triggering Convex Migration Action...`);

  // 2. Call the Convex action and pass ALL data
  const result = await client.action(api.seedCPCA.runMigration, {
    staff: usersData.staff,
    students: usersData.students,
    scheduleConfig: schedulesData.classes,
  });

  // 3. Output the results
  console.log(`\n========================================`);
  console.log(`✅ SCHOOL_ID created: ${result.schoolId}`);
  console.log(`✅ CAMPUS_ID created: ${result.campusId}`);
  console.log(`========================================\n`);
  console.log("✨ Migration Complete! Please copy the SCHOOL_ID above to your .env.local");
}

main().catch(console.error);