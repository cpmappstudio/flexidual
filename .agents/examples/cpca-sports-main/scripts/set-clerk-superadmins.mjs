#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { createClerkClient } from "@clerk/backend";

function hasFlag(args, name) {
  return args.includes(name);
}

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
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
      "Set Clerk superadmins for single-tenant mode",
      "",
      "Usage:",
      "  node scripts/set-clerk-superadmins.mjs [--execute] (--user <idOrEmail> ...)",
      "",
      "Flags:",
      "  --execute  Apply changes in Clerk. Without this flag, it runs in dry-run.",
      "",
      "Args:",
      "  --user     Clerk user id (user_...) or email address. Repeatable.",
      "",
      "Environment variables:",
      "  CLERK_SECRET_KEY (required)",
      "",
      "Examples:",
      "  node scripts/set-clerk-superadmins.mjs --user user_123 --user admin@example.com",
      "  node scripts/set-clerk-superadmins.mjs --execute --user user_123",
      "",
    ].join("\n"),
  );
}

function parseUsers(args) {
  const users = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--user") continue;
    const value = args[i + 1];
    if (value) {
      users.push(value);
    }
    i += 1;
  }
  return users;
}

function coercePublicMetadata(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
}

function getPrimaryEmail(user) {
  const primaryById = user.emailAddresses?.find(
    (item) => item.id === user.primaryEmailAddressId,
  )?.emailAddress;
  return primaryById ?? user.emailAddresses?.[0]?.emailAddress ?? "";
}

async function resolveUser(clerk, identifier) {
  if (identifier.startsWith("user_")) {
    return await clerk.users.getUser(identifier);
  }

  const users = await clerk.users.getUserList({
    emailAddress: [identifier],
    limit: 1,
  });
  return users.data[0] ?? null;
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
  const identifiers = parseUsers(args);
  if (identifiers.length === 0) {
    usage();
    process.exitCode = 1;
    return;
  }

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    throw new Error("Missing required environment variable: CLERK_SECRET_KEY");
  }

  const clerk = createClerkClient({ secretKey: clerkSecretKey });

  const targets = [];
  const failures = [];

  for (const identifier of identifiers) {
    try {
      const user = await resolveUser(clerk, identifier);
      if (!user) {
        failures.push({ identifier, message: "User not found" });
        continue;
      }
      const publicMetadata = coercePublicMetadata(user.publicMetadata);
      const currentIsSuperAdmin = publicMetadata.isSuperAdmin === true;
      const currentRole = publicMetadata.role;
      const desiredRole = "admin";

      targets.push({
        identifier,
        userId: user.id,
        email: getPrimaryEmail(user),
        currentIsSuperAdmin,
        currentRole,
        desiredIsSuperAdmin: true,
        desiredRole,
        publicMetadata,
        needsUpdate:
          currentIsSuperAdmin !== true || publicMetadata.role !== desiredRole,
      });
    } catch (error) {
      const message = error?.errors?.[0]?.message ?? error?.message ?? "Unknown";
      failures.push({ identifier, message: String(message) });
    }
  }

  console.log(
    `[summary] targets=${targets.length} failures=${failures.length} mode=${
      execute ? "execute" : "dry-run"
    }`,
  );

  for (const target of targets) {
    console.log(
      `- ${target.userId} ${target.email || target.identifier} super=${target.currentIsSuperAdmin} role=${String(
        target.currentRole ?? "(none)",
      )} -> super=true role=${target.desiredRole} ${
        target.needsUpdate ? "" : "(no-op)"
      }`,
    );
  }

  if (failures.length > 0) {
    console.log("[failures]");
    for (const failure of failures) {
      console.log(`- ${failure.identifier}: ${failure.message}`);
    }
  }

  if (!execute) {
    console.log("[dry-run] No changes applied. Re-run with --execute.");
    return;
  }

  let updated = 0;
  const updateFailures = [];

  for (const target of targets) {
    if (!target.needsUpdate) continue;
    try {
      await clerk.users.updateUserMetadata(target.userId, {
        publicMetadata: {
          ...target.publicMetadata,
          isSuperAdmin: true,
          role: target.desiredRole,
        },
      });
      updated += 1;
    } catch (error) {
      const message = error?.errors?.[0]?.message ?? error?.message ?? "Unknown";
      updateFailures.push({
        userId: target.userId,
        identifier: target.identifier,
        message: String(message),
      });
    }
  }

  console.log(
    `[result] updated=${updated} failed=${updateFailures.length} total=${targets.length}`,
  );
  if (updateFailures.length > 0) {
    console.log("[updateFailures]");
    for (const failure of updateFailures) {
      console.log(`- ${failure.userId} ${failure.identifier}: ${failure.message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
});
