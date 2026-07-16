#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { createClerkClient } from "@clerk/backend";

const VALID_ROLES = new Set(["admin", "member"]);
const ROLE_ALIASES = new Map([
  ["org:admin", "admin"],
  ["org:member", "member"],
  ["org:superadmin", "admin"],
  ["superadmin", "admin"],
]);

function hasFlag(args, name) {
  return args.includes(name);
}

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function normalizeRole(value) {
  if (typeof value !== "string") {
    return null;
  }

  if (VALID_ROLES.has(value)) {
    return value;
  }

  return ROLE_ALIASES.get(value) ?? null;
}

function resolveDesiredRole(publicMetadata) {
  const normalizedRole = normalizeRole(publicMetadata?.role);
  if (normalizedRole) {
    return normalizedRole;
  }

  if (publicMetadata?.isSuperAdmin === true) {
    return "admin";
  }

  return "member";
}

function getPrimaryEmail(user) {
  const primaryById = user.emailAddresses?.find(
    (item) => item.id === user.primaryEmailAddressId,
  )?.emailAddress;
  return primaryById ?? user.emailAddresses?.[0]?.emailAddress ?? "";
}

function coercePublicMetadata(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
}

function formatRole(value) {
  return value ?? "(none)";
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

function usage() {
  console.log(
    [
      "",
      "Backfill Clerk roles for single-tenant mode",
      "",
      "Usage:",
      "  node scripts/backfill-single-tenant-roles.mjs [--execute] [--all] [--limit <n>]",
      "",
      "Flags:",
      "  --execute    Apply changes in Clerk. Without this flag, it runs in dry-run.",
      "  --all        Reconcile all users to the normalized role (admin/member).",
      "               Default behavior only fills users with missing role.",
      "  --limit      Process at most N candidate users (useful for testing).",
      "",
      "Environment variables:",
      "  CLERK_SECRET_KEY (required)",
      "",
      "Examples:",
      "  node scripts/backfill-single-tenant-roles.mjs",
      "  node scripts/backfill-single-tenant-roles.mjs --execute",
      "  node scripts/backfill-single-tenant-roles.mjs --execute --limit 10",
      "",
    ].join("\n"),
  );
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const args = process.argv.slice(2);
  if (hasFlag(args, "--help")) {
    usage();
    return;
  }

  const execute = hasFlag(args, "--execute");
  const reconcileAll = hasFlag(args, "--all");
  const limitRaw = getArg(args, "--limit");
  const limit = limitRaw ? Number(limitRaw) : 0;

  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("--limit must be a non-negative integer");
  }

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    throw new Error("Missing required environment variable: CLERK_SECRET_KEY");
  }

  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  const candidates = [];

  let offset = 0;
  let totalUsers = 0;
  const pageSize = 100;

  while (true) {
    const page = await clerk.users.getUserList({
      limit: pageSize,
      offset,
    });
    if (page.data.length === 0) {
      break;
    }

    for (const user of page.data) {
      totalUsers += 1;

      const publicMetadata = coercePublicMetadata(user.publicMetadata);
      const currentRole = normalizeRole(publicMetadata.role);
      const desiredRole = resolveDesiredRole(publicMetadata);
      const shouldUpdate = reconcileAll
        ? currentRole !== desiredRole
        : currentRole === null;

      if (!shouldUpdate) {
        continue;
      }

      candidates.push({
        userId: user.id,
        email: getPrimaryEmail(user),
        currentRole,
        desiredRole,
        isSuperAdmin: publicMetadata.isSuperAdmin === true,
        publicMetadata,
      });
    }

    offset += page.data.length;
    if (page.data.length < pageSize) {
      break;
    }
  }

  const selectedCandidates =
    limit > 0 ? candidates.slice(0, limit) : candidates;

  console.log(
    `[summary] users=${totalUsers} candidates=${selectedCandidates.length} mode=${
      execute ? "execute" : "dry-run"
    } reconcile=${reconcileAll ? "all" : "missing-only"}`,
  );

  if (selectedCandidates.length === 0) {
    console.log("[summary] No users require updates.");
    return;
  }

  const previewSize = Math.min(20, selectedCandidates.length);
  console.log(`[preview] Showing ${previewSize} candidate(s):`);
  for (const candidate of selectedCandidates.slice(0, previewSize)) {
    console.log(
      `- ${candidate.userId} ${candidate.email} role ${formatRole(candidate.currentRole)} -> ${candidate.desiredRole} super=${candidate.isSuperAdmin}`,
    );
  }
  if (selectedCandidates.length > previewSize) {
    console.log(
      `[preview] ...and ${selectedCandidates.length - previewSize} more`,
    );
  }

  if (!execute) {
    console.log("[dry-run] No changes applied. Re-run with --execute.");
    return;
  }

  let updated = 0;
  const failures = [];

  for (const candidate of selectedCandidates) {
    try {
      await clerk.users.updateUserMetadata(candidate.userId, {
        publicMetadata: {
          ...candidate.publicMetadata,
          role: candidate.desiredRole,
        },
      });
      updated += 1;
    } catch (error) {
      const message =
        error?.errors?.[0]?.message ?? error?.message ?? "Unknown error";
      failures.push({
        userId: candidate.userId,
        email: candidate.email,
        message: String(message),
      });
    }
  }

  console.log(
    `[result] updated=${updated} failed=${failures.length} total=${selectedCandidates.length}`,
  );

  if (failures.length > 0) {
    console.log("[failures]");
    for (const failure of failures) {
      console.log(`- ${failure.userId} ${failure.email}: ${failure.message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${message}`);
  process.exitCode = 1;
});
