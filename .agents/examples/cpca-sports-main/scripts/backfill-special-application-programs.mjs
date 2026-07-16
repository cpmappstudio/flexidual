#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

function hasFlag(args, name) {
  return args.includes(name);
}

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadEnvFile(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key] !== undefined) continue;

    let rawValue = trimmed.slice(idx + 1).trim();
    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      rawValue = rawValue.slice(1, -1);
    }
    process.env[key] = rawValue;
  }
}

function printUsage() {
  console.log(
    [
      "",
      "Special Application Program Backfill",
      "",
      "Usage:",
      "  node scripts/backfill-special-application-programs.mjs [--execute] [--limit 50] [--output /tmp/report.json]",
      "",
      "Environment variables (required):",
      "  NEXT_PUBLIC_CONVEX_URL",
      "  LEGACY_MIGRATION_SECRET",
      "",
      "Behavior:",
      "  - Dry-run by default.",
      "  - Migrates only explicit legacy program mappings:",
      "    pg-basketball -> Basketball",
      "    hr14_baseball -> Baseball",
      "    volleyball-club -> Volleyball",
      "  - Leaves softball unchanged.",
      "  - Updates programId/programSnapshot only; formData is left unchanged.",
      "",
    ].join("\n"),
  );
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const args = process.argv.slice(2);
  if (hasFlag(args, "--help")) {
    printUsage();
    return;
  }

  const execute = hasFlag(args, "--execute");
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const migrationSecret = process.env.LEGACY_MIGRATION_SECRET;
  if (!convexUrl || !migrationSecret) {
    throw new Error(
      "Missing required env vars: NEXT_PUBLIC_CONVEX_URL and/or LEGACY_MIGRATION_SECRET",
    );
  }

  const limit = Math.max(1, toNumber(getArg(args, "--limit", 50), 50));
  const output = getArg(
    args,
    "--output",
    "/tmp/cpca-special-application-program-backfill.json",
  );
  const convex = new ConvexHttpClient(convexUrl);

  console.log(
    `[start] mode=${execute ? "execute" : "dry-run"} limit=${limit} url=${convexUrl}`,
  );

  const result = await convex.mutation(
    api.legacyMigration.backfillSpecialApplicationPrograms,
    {
      secret: migrationSecret,
      dryRun: !execute,
      limit,
    },
  );

  await fs.writeFile(output, JSON.stringify(result, null, 2));

  console.log("");
  console.log("Special Application Program Backfill Summary");
  console.log("============================================");
  console.log(`Mode: ${execute ? "execute" : "dry-run"}`);
  console.log(`Total applications: ${result.totalApplications}`);
  console.log(`Attempted updates: ${result.attemptedUpdates}`);
  console.log(`Updated applications: ${result.updatedApplications}`);
  console.log(`By status: ${JSON.stringify(result.byStatus)}`);
  console.log(`Report: ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
