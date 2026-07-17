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
      "Application Photo Audit",
      "",
      "Usage:",
      "  node scripts/audit-application-photos.mjs [--output /tmp/report.json] [--concurrency 8]",
      "",
      "Environment variables (required):",
      "  NEXT_PUBLIC_CONVEX_URL",
      "  LEGACY_MIGRATION_SECRET",
      "",
      "Notes:",
      "  - Detects real file format from bytes.",
      "  - HEIC/HEIF files are reported only; they are not processed.",
      "",
    ].join("\n"),
  );
}

function detectFormat(buffer) {
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brands = buffer
      .toString("ascii", 8, Math.min(buffer.length, 64))
      .toLowerCase();

    if (
      brands.includes("heic") ||
      brands.includes("heix") ||
      brands.includes("hevc") ||
      brands.includes("hevx")
    ) {
      return "heic";
    }
    if (
      brands.includes("heif") ||
      brands.includes("mif1") ||
      brands.includes("msf1")
    ) {
      return "heif";
    }
    return "iso-bmff";
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.toString("ascii", 1, 4) === "PNG"
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (
    buffer.length >= 6 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" ||
      buffer.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return "gif";
  }

  return "unknown";
}

async function fetchPrefix(url) {
  const response = await fetch(url, { headers: { Range: "bytes=0-255" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

async function auditRow(row) {
  if (!row.url) {
    return {
      ...row,
      actualFormat: "missing-url",
      isSupportedForBackfill: false,
      isHeicLike: false,
    };
  }

  try {
    const prefix = await fetchPrefix(row.url);
    const actualFormat = detectFormat(prefix);
    return {
      ...row,
      actualFormat,
      isSupportedForBackfill: ["jpeg", "png", "webp"].includes(actualFormat),
      isHeicLike: ["heic", "heif"].includes(actualFormat),
    };
  } catch (error) {
    return {
      ...row,
      actualFormat: "fetch-error",
      fetchError: error instanceof Error ? error.message : String(error),
      isSupportedForBackfill: false,
      isHeicLike: false,
    };
  }
}

function summarize(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.byActualFormat[row.actualFormat] =
        (summary.byActualFormat[row.actualFormat] ?? 0) + 1;
      summary.supportedForBackfill += row.isSupportedForBackfill ? 1 : 0;
      summary.heicLike += row.isHeicLike ? 1 : 0;
      summary.fetchErrors += row.actualFormat === "fetch-error" ? 1 : 0;
      return summary;
    },
    {
      total: rows.length,
      byActualFormat: {},
      supportedForBackfill: 0,
      heicLike: 0,
      fetchErrors: 0,
    },
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

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const migrationSecret = process.env.LEGACY_MIGRATION_SECRET;
  if (!convexUrl || !migrationSecret) {
    throw new Error(
      "Missing required env vars: NEXT_PUBLIC_CONVEX_URL and/or LEGACY_MIGRATION_SECRET",
    );
  }

  const output = getArg(args, "--output", "/tmp/cpca-application-photo-audit.json");
  const concurrency = Math.min(
    20,
    Math.max(1, toNumber(getArg(args, "--concurrency", 8), 8)),
  );
  const convex = new ConvexHttpClient(convexUrl);

  console.log(`[audit] loading photo references from ${convexUrl}`);
  const source = await convex.mutation(api.legacyMigration.auditApplicationPhotos, {
    secret: migrationSecret,
  });
  console.log(
    `[audit] applications=${source.totalApplications} photos=${source.totalPhotos}`,
  );

  const rows = await mapWithConcurrency(source.rows, concurrency, auditRow);
  const summary = summarize(rows);
  const heic = rows
    .filter((row) => row.isHeicLike)
    .map((row) => ({
      applicationId: row.applicationId,
      applicationCode: row.applicationCode,
      name: row.name,
      storageId: row.storageId,
      source: row.source,
      actualFormat: row.actualFormat,
      metadataContentType: row.metadataContentType,
      metadataSize: row.metadataSize,
    }));
  const fetchErrors = rows
    .filter((row) => row.actualFormat === "fetch-error")
    .map((row) => ({
      applicationId: row.applicationId,
      applicationCode: row.applicationCode,
      name: row.name,
      storageId: row.storageId,
      source: row.source,
      fetchError: row.fetchError,
    }));

  await fs.writeFile(
    output,
    JSON.stringify({ summary, heic, fetchErrors, rows }, null, 2),
  );

  console.log("");
  console.log("Application Photo Audit Summary");
  console.log("===============================");
  console.log(`Total photos: ${summary.total}`);
  console.log(`Supported for backfill: ${summary.supportedForBackfill}`);
  console.log(`HEIC/HEIF reported only: ${summary.heicLike}`);
  console.log(`Fetch errors: ${summary.fetchErrors}`);
  console.log(`By actual format: ${JSON.stringify(summary.byActualFormat)}`);
  console.log(`Report: ${output}`);

  if (heic.length > 0) {
    console.log("");
    console.log("HEIC/HEIF Photos");
    console.table(heic);
  }

  if (fetchErrors.length > 0) {
    console.log("");
    console.log("Fetch Errors");
    console.table(fetchErrors);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
