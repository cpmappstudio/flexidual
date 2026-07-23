import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { throwAppError } from "./errors";

export const PROFILE_PIN_LENGTH = 4;
export const PROFILE_PIN_MAX_FAILED_ATTEMPTS = 5;
export const PROFILE_PIN_LOCK_MS = 5 * 60 * 1000;
export const PROFILE_PIN_UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;
export const PROFILE_PIN_HASH_ALGORITHM = "pbkdf2-sha256";
export const PROFILE_PIN_HASH_ITERATIONS = 100_000;

const PROFILE_PIN_PATTERN = /^\d{4}$/;

type ProfilePinReaderCtx = Pick<QueryCtx, "db">;
type ProfilePinWriterCtx = Pick<MutationCtx, "db">;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

export function assertProfilePinFormat(pin: string) {
  if (!PROFILE_PIN_PATTERN.test(pin)) {
    throwAppError("PROFILE_PIN_INVALID_FORMAT");
  }
}

export function createProfilePinSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(bytes);
}

async function hashLegacyProfilePin(pin: string, salt: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${pin}`),
  );

  return bytesToHex(new Uint8Array(buffer));
}

export async function hashProfilePin(
  pin: string,
  salt: string,
  iterations = PROFILE_PIN_HASH_ITERATIONS,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(salt),
      iterations,
    },
    key,
    256,
  );

  return bytesToHex(new Uint8Array(bits));
}

async function verifyProfilePinHash(
  pin: string,
  pinRecord: Doc<"organizationPersonPins">,
) {
  const usesCurrentHash =
    pinRecord.algorithm === PROFILE_PIN_HASH_ALGORITHM &&
    pinRecord.iterations === PROFILE_PIN_HASH_ITERATIONS;
  const pinHash = usesCurrentHash
    ? await hashProfilePin(pin, pinRecord.salt, PROFILE_PIN_HASH_ITERATIONS)
    : await hashLegacyProfilePin(pin, pinRecord.salt);

  return {
    isValid: pinHash === pinRecord.pinHash,
    shouldRehash: !usesCurrentHash,
  };
}

export async function getOrganizationPersonPin(
  ctx: ProfilePinReaderCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  return await ctx.db
    .query("organizationPersonPins")
    .withIndex("by_org_id_and_op_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId),
    )
    .unique();
}

export async function setOrganizationPersonPin(
  ctx: ProfilePinWriterCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    pin: string;
  },
) {
  assertProfilePinFormat(args.pin);

  const now = Date.now();
  const salt = createProfilePinSalt();
  const pinHash = await hashProfilePin(args.pin, salt);
  const existingPin = await getOrganizationPersonPin(ctx, args);

  if (existingPin) {
    await ctx.db.patch(existingPin._id, {
      algorithm: PROFILE_PIN_HASH_ALGORITHM,
      iterations: PROFILE_PIN_HASH_ITERATIONS,
      pinHash,
      salt,
      failedAttemptCount: 0,
      lockedUntil: undefined,
      updatedAt: now,
    });
    return existingPin._id;
  }

  return await ctx.db.insert("organizationPersonPins", {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    algorithm: PROFILE_PIN_HASH_ALGORITHM,
    iterations: PROFILE_PIN_HASH_ITERATIONS,
    pinHash,
    salt,
    failedAttemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function verifyOrganizationPersonPin(
  ctx: ProfilePinWriterCtx,
  args: {
    pinRecord: Doc<"organizationPersonPins">;
    pin: string;
  },
) {
  assertProfilePinFormat(args.pin);

  const now = Date.now();
  if (args.pinRecord.lockedUntil && args.pinRecord.lockedUntil > now) {
    throwAppError("PROFILE_PIN_LOCKED");
  }

  const verification = await verifyProfilePinHash(args.pin, args.pinRecord);
  if (verification.isValid) {
    const patch = {
      ...(verification.shouldRehash
        ? {
            algorithm: PROFILE_PIN_HASH_ALGORITHM,
            iterations: PROFILE_PIN_HASH_ITERATIONS,
            pinHash: await hashProfilePin(
              args.pin,
              args.pinRecord.salt,
              PROFILE_PIN_HASH_ITERATIONS,
            ),
          }
        : {}),
      failedAttemptCount: 0,
      lockedUntil: undefined,
      updatedAt: now,
    };

    if (
      verification.shouldRehash ||
      args.pinRecord.failedAttemptCount > 0 ||
      args.pinRecord.lockedUntil !== undefined
    ) {
      await ctx.db.patch(args.pinRecord._id, patch);
    }
    return;
  }

  const failedAttemptCount = args.pinRecord.failedAttemptCount + 1;
  await ctx.db.patch(args.pinRecord._id, {
    failedAttemptCount,
    lockedUntil:
      failedAttemptCount >= PROFILE_PIN_MAX_FAILED_ATTEMPTS
        ? now + PROFILE_PIN_LOCK_MS
        : undefined,
    updatedAt: now,
  });

  throwAppError(
    failedAttemptCount >= PROFILE_PIN_MAX_FAILED_ATTEMPTS
      ? "PROFILE_PIN_LOCKED"
      : "PROFILE_PIN_INVALID",
  );
}

export async function isOrganizationPersonProfileUnlocked(
  ctx: ProfilePinReaderCtx,
  args: {
    authSessionId: Id<"authSessions"> | null;
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  if (!args.authSessionId) {
    return false;
  }

  const authSessionId = args.authSessionId;
  const unlock = await ctx.db
    .query("organizationPersonProfileUnlocks")
    .withIndex("by_org_id_and_op_id_and_auth_session_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId)
        .eq("authSessionId", authSessionId),
    )
    .unique();

  return !!unlock && unlock.expiresAt > Date.now();
}

export async function unlockOrganizationPersonProfile(
  ctx: ProfilePinWriterCtx,
  args: {
    authSessionId: Id<"authSessions">;
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    userId: Id<"users">;
  },
) {
  const now = Date.now();
  const existingUnlock = await ctx.db
    .query("organizationPersonProfileUnlocks")
    .withIndex("by_org_id_and_op_id_and_auth_session_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId)
        .eq("authSessionId", args.authSessionId),
    )
    .unique();
  const unlockFields = {
    userId: args.userId,
    unlockedAt: now,
    expiresAt: now + PROFILE_PIN_UNLOCK_TTL_MS,
    updatedAt: now,
  };

  if (existingUnlock) {
    await ctx.db.patch(existingUnlock._id, unlockFields);
    return existingUnlock._id;
  }

  return await ctx.db.insert("organizationPersonProfileUnlocks", {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    authSessionId: args.authSessionId,
    ...unlockFields,
    createdAt: now,
  });
}

export async function lockOrganizationPersonProfile(
  ctx: ProfilePinWriterCtx,
  args: {
    authSessionId: Id<"authSessions"> | null;
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  if (!args.authSessionId) {
    return;
  }

  const authSessionId = args.authSessionId;
  const unlock = await ctx.db
    .query("organizationPersonProfileUnlocks")
    .withIndex("by_org_id_and_op_id_and_auth_session_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId)
        .eq("authSessionId", authSessionId),
    )
    .unique();

  if (unlock) {
    await ctx.db.delete(unlock._id);
  }
}

export async function invalidateOrganizationPersonProfileUnlocks(
  ctx: ProfilePinWriterCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  const unlocks = await ctx.db
    .query("organizationPersonProfileUnlocks")
    .withIndex("by_org_id_and_op_id_and_auth_session_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId),
    )
    .take(100);

  for (const unlock of unlocks) {
    await ctx.db.delete(unlock._id);
  }
}

export async function deleteOrganizationPersonPinsForOrganizationBatch(
  ctx: ProfilePinWriterCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const pins = await ctx.db
    .query("organizationPersonPins")
    .withIndex("by_org_id_and_op_id", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const pin of pins) {
    await ctx.db.delete(pin._id);
  }

  return pins.length;
}

export async function deleteOrganizationPersonProfileUnlocksForOrganizationBatch(
  ctx: ProfilePinWriterCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const unlocks = await ctx.db
    .query("organizationPersonProfileUnlocks")
    .withIndex("by_org_id_and_op_id_and_auth_session_id", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const unlock of unlocks) {
    await ctx.db.delete(unlock._id);
  }

  return unlocks.length;
}

export async function deleteOrganizationPersonPinsForOrganizationPersonBatch(
  ctx: ProfilePinWriterCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
  batchSize: number,
) {
  const pins = await ctx.db
    .query("organizationPersonPins")
    .withIndex("by_org_id_and_op_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId),
    )
    .take(batchSize);

  for (const pin of pins) {
    await ctx.db.delete(pin._id);
  }

  return pins.length;
}

export async function deleteOrganizationPersonProfileUnlocksForOrganizationPersonBatch(
  ctx: ProfilePinWriterCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
  batchSize: number,
) {
  const unlocks = await ctx.db
    .query("organizationPersonProfileUnlocks")
    .withIndex("by_org_id_and_op_id_and_auth_session_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId),
    )
    .take(batchSize);

  for (const unlock of unlocks) {
    await ctx.db.delete(unlock._id);
  }

  return unlocks.length;
}
