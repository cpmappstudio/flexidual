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
      "Convex Storage Cleanup",
      "",
      "Usage:",
      "  node scripts/cleanup-convex-storage.mjs [--execute] [--batch-size 200] [--max-batches 20]",
      "",
      "Environment variables (required):",
      "  NEXT_PUBLIC_CONVEX_URL",
      "  LEGACY_MIGRATION_SECRET",
      "",
      "Examples:",
      "  node scripts/cleanup-convex-storage.mjs",
      "  node scripts/cleanup-convex-storage.mjs --execute",
      "  node scripts/cleanup-convex-storage.mjs --execute --batch-size 500",
      "",
    ].join("\n"),
  );
}

function printBatch(index, result, mode) {
  console.log(`[batch ${index}] mode=${mode}`);
  console.log(
    `[batch ${index}] total=${result.totalStorageFiles} referenced=${result.referencedStorageFiles} orphaned=${result.orphanedStorageFiles}`,
  );
  console.log(
    `[batch ${index}] refs applications=${result.referencedFromApplications} documents=${result.referencedFromDocuments} photoMappings=${result.referencedFromPhotoMappings}`,
  );
  console.log(
    `[batch ${index}] attempted=${result.attemptedDeletions} deleted=${result.deletedStorageFiles} hasMore=${result.hasMore}`,
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
  const mode = execute ? "execute" : "dry-run";
  const batchSize = Math.min(
    2000,
    Math.max(1, toNumber(getArg(args, "--batch-size", 200), 200)),
  );
  const maxBatches = Math.max(
    1,
    toNumber(getArg(args, "--max-batches", 20), 20),
  );

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const migrationSecret = process.env.LEGACY_MIGRATION_SECRET;
  if (!convexUrl || !migrationSecret) {
    throw new Error(
      "Missing required env vars: NEXT_PUBLIC_CONVEX_URL and/or LEGACY_MIGRATION_SECRET",
    );
  }

  const convex = new ConvexHttpClient(convexUrl);

  console.log(
    `[start] mode=${mode} batchSize=${batchSize} maxBatches=${maxBatches}`,
  );

  let totalDeleted = 0;
  let batchesRun = 0;
  let lastResult = null;

  while (batchesRun < maxBatches) {
    batchesRun += 1;
    const result = await convex.mutation(api.legacyMigration.cleanupOrphanedStorage, {
      secret: migrationSecret,
      dryRun: !execute,
      limit: batchSize,
    });

    lastResult = result;
    totalDeleted += result.deletedStorageFiles;
    printBatch(batchesRun, result, mode);

    if (!execute) {
      break;
    }

    if (!result.hasMore || result.deletedStorageFiles === 0) {
      break;
    }
  }

  if (!lastResult) {
    throw new Error("Cleanup did not run");
  }

  console.log("");
  console.log("Cleanup Summary");
  console.log("===============");
  console.log(`Mode: ${mode}`);
  console.log(`Batches run: ${batchesRun}`);
  console.log(`Total deleted: ${totalDeleted}`);
  console.log(`Total storage files (last batch): ${lastResult.totalStorageFiles}`);
  console.log(
    `Referenced files (last batch): ${lastResult.referencedStorageFiles}`,
  );
  console.log(`Orphaned files (last batch): ${lastResult.orphanedStorageFiles}`);
  console.log(`Has more: ${lastResult.hasMore}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
