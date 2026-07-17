#!/usr/bin/env node

import { promises as fs } from "node:fs";
import sharp from "sharp";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const HEIC_FORMATS = new Set(["heic", "heif"]);
const TARGET_CONTENT_TYPE = "image/webp";
const TARGET_MAX_DIMENSION = 512;
const TARGET_QUALITY = 82;
const OPTIMIZED_SIZE_THRESHOLD = 150 * 1024;

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
      "Application Photo Backfill",
      "",
      "Usage:",
      "  node scripts/backfill-application-photos.mjs [--execute] [--limit 25] [--output /tmp/report.json]",
      "",
      "Environment variables (required):",
      "  NEXT_PUBLIC_CONVEX_URL",
      "  LEGACY_MIGRATION_SECRET",
      "",
      "Behavior:",
      "  - Dry-run by default.",
      "  - Optimizes only JPEG, PNG, and WebP.",
      "  - Reports HEIC/HEIF and unsupported formats without processing them.",
      "  - Updates only application photo references after upload.",
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

  return "unknown";
}

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function uploadToConvexStorage(convex, migrationSecret, buffer) {
  const uploadUrl = await convex.mutation(
    api.files.generateUploadUrlForMigration,
    {
      secret: migrationSecret,
    },
  );
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": TARGET_CONTENT_TYPE },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.storageId) {
    throw new Error("Upload response missing storageId");
  }

  return payload.storageId;
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

function shouldSkipOptimized(row, metadata, outputSize) {
  const maxDimension = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  return (
    row.actualFormat === "webp" &&
    maxDimension <= TARGET_MAX_DIMENSION &&
    outputSize <= OPTIMIZED_SIZE_THRESHOLD
  );
}

async function optimizePhoto(buffer) {
  const image = sharp(buffer, { failOn: "error" }).rotate();
  const metadata = await image.metadata();
  const optimizedBuffer = await image
    .resize({
      width: TARGET_MAX_DIMENSION,
      height: TARGET_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#fff" })
    .webp({ quality: TARGET_QUALITY })
    .toBuffer();

  return {
    buffer: optimizedBuffer,
    metadata,
    outputSize: optimizedBuffer.length,
  };
}

async function buildAuditRows(convex, migrationSecret, concurrency) {
  const source = await convex.mutation(api.legacyMigration.auditApplicationPhotos, {
    secret: migrationSecret,
  });

  const rows = await mapWithConcurrency(
    source.rows,
    concurrency,
    async (row) => {
      if (!row.url) {
        return {
          ...row,
          actualFormat: "missing-url",
          isSupportedForBackfill: false,
          isHeicLike: false,
        };
      }

      try {
        const buffer = await fetchBuffer(row.url);
        const actualFormat = detectFormat(buffer.subarray(0, 256));
        return {
          ...row,
          actualFormat,
          buffer,
          isSupportedForBackfill: SUPPORTED_FORMATS.has(actualFormat),
          isHeicLike: HEIC_FORMATS.has(actualFormat),
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
    },
  );

  return {
    totalApplications: source.totalApplications,
    totalPhotos: source.totalPhotos,
    rows,
  };
}

async function processRow(row, options) {
  const base = {
    applicationId: row.applicationId,
    applicationCode: row.applicationCode,
    name: row.name,
    source: row.source,
    oldStorageId: row.storageId,
    actualFormat: row.actualFormat,
    metadataContentType: row.metadataContentType,
    metadataSize: row.metadataSize,
  };

  if (row.isHeicLike) {
    return { ...base, status: "skipped-heic" };
  }
  if (!row.isSupportedForBackfill || !row.buffer) {
    return {
      ...base,
      status: "skipped-unsupported",
      error: row.fetchError ?? undefined,
    };
  }

  try {
    const optimized = await optimizePhoto(row.buffer);
    const maxDimension = Math.max(
      optimized.metadata.width ?? 0,
      optimized.metadata.height ?? 0,
    );

    if (shouldSkipOptimized(row, optimized.metadata, row.buffer.length)) {
      return {
        ...base,
        status: "skipped-already-optimized",
        inputWidth: optimized.metadata.width ?? null,
        inputHeight: optimized.metadata.height ?? null,
        inputSize: row.buffer.length,
      };
    }

    const result = {
      ...base,
      status: options.execute ? "updated" : "would-update",
      inputWidth: optimized.metadata.width ?? null,
      inputHeight: optimized.metadata.height ?? null,
      inputMaxDimension: maxDimension,
      inputSize: row.buffer.length,
      outputContentType: TARGET_CONTENT_TYPE,
      outputSize: optimized.outputSize,
    };

    if (!options.execute) {
      return result;
    }

    const newStorageId = await uploadToConvexStorage(
      options.convex,
      options.migrationSecret,
      optimized.buffer,
    );
    const patchResult = await options.convex.mutation(
      api.legacyMigration.replaceApplicationPhotoStorage,
      {
        secret: options.migrationSecret,
        applicationId: row.applicationId,
        oldStorageId: row.storageId,
        newStorageId,
      },
    );

    return {
      ...result,
      newStorageId,
      applicantUpdated: patchResult.applicantUpdated,
      formDataUpdated: patchResult.formDataUpdated,
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(results) {
  return results.reduce(
    (summary, result) => {
      summary.byStatus[result.status] = (summary.byStatus[result.status] ?? 0) + 1;
      summary.inputBytes += result.inputSize ?? 0;
      summary.outputBytes += result.outputSize ?? 0;
      return summary;
    },
    {
      total: results.length,
      inputBytes: 0,
      outputBytes: 0,
      byStatus: {},
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

  const execute = hasFlag(args, "--execute");
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const migrationSecret = process.env.LEGACY_MIGRATION_SECRET;
  if (!convexUrl || !migrationSecret) {
    throw new Error(
      "Missing required env vars: NEXT_PUBLIC_CONVEX_URL and/or LEGACY_MIGRATION_SECRET",
    );
  }

  const limit = Math.max(1, toNumber(getArg(args, "--limit", 25), 25));
  const concurrency = Math.min(
    10,
    Math.max(1, toNumber(getArg(args, "--concurrency", 4), 4)),
  );
  const output = getArg(
    args,
    "--output",
    "/tmp/cpca-application-photo-backfill.json",
  );
  const convex = new ConvexHttpClient(convexUrl);

  console.log(
    `[start] mode=${execute ? "execute" : "dry-run"} limit=${limit} concurrency=${concurrency}`,
  );
  const audit = await buildAuditRows(convex, migrationSecret, concurrency);
  const candidateRows = audit.rows.filter((row) => row.isSupportedForBackfill);
  const skippedRows = audit.rows.filter((row) => !row.isSupportedForBackfill);

  console.log(
    `[audit] applications=${audit.totalApplications} photos=${audit.totalPhotos} candidates=${candidateRows.length} skipped=${skippedRows.length}`,
  );

  const processed = [];
  let attemptedUpdates = 0;

  for (const row of candidateRows) {
    const result = await processRow(row, {
      execute,
      convex,
      migrationSecret,
    });
    processed.push(result);

    if (result.status === "updated" || result.status === "would-update") {
      attemptedUpdates += 1;
    }
    if (attemptedUpdates >= limit) {
      break;
    }
  }
  const skipped = skippedRows.map((row) => ({
    applicationId: row.applicationId,
    applicationCode: row.applicationCode,
    name: row.name,
    source: row.source,
    oldStorageId: row.storageId,
    actualFormat: row.actualFormat,
    metadataContentType: row.metadataContentType,
    metadataSize: row.metadataSize,
    status: row.isHeicLike ? "skipped-heic" : "skipped-unsupported",
    error: row.fetchError ?? undefined,
  }));
  const results = [...processed, ...skipped];
  const summary = summarize(results);

  await fs.writeFile(output, JSON.stringify({ summary, results }, null, 2));

  console.log("");
  console.log("Application Photo Backfill Summary");
  console.log("==================================");
  console.log(`Mode: ${execute ? "execute" : "dry-run"}`);
  console.log(`Processed candidates: ${processed.length}`);
  console.log(`Attempted updates: ${attemptedUpdates}`);
  console.log(`Total report rows: ${results.length}`);
  console.log(`By status: ${JSON.stringify(summary.byStatus)}`);
  console.log(`Input bytes: ${summary.inputBytes}`);
  console.log(`Output bytes: ${summary.outputBytes}`);
  console.log(`Report: ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
