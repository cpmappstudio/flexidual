import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { throwAppError } from "./errors";
import {
  getEffectivePersonAvatarUrl,
  getPersonDisplayName,
  getPersonNameParts,
  getUserPersonOrNull,
} from "./people";
import { MAX_USER_MEMBERSHIPS_FOR_DEFAULT_REASSIGN } from "./queryLimits";

type Context = QueryCtx | MutationCtx;
type UserDoc = Doc<"users">;
type PersonDoc = Doc<"people">;
type PlatformRole = NonNullable<UserDoc["platformRole"]>;

export function getEffectivePlatformRole(user: Pick<UserDoc, "platformRole">) {
  return user.platformRole;
}

export async function canEditOwnProfileName(ctx: Context, user: UserDoc) {
  if (getEffectivePlatformRole(user)) {
    return true;
  }

  if (!user.defaultOrganizationId) {
    return true;
  }

  const defaultOrganizationId = user.defaultOrganizationId;
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_user_id_and_organization_id", (query) =>
      query.eq("userId", user._id).eq("organizationId", defaultOrganizationId),
    )
    .unique();

  return !!membership;
}

export function buildPlatformAccessPatch(
  role: PlatformRole | undefined,
): Pick<UserDoc, "platformRole" | "hasPlatformAccess"> {
  return {
    platformRole: role,
    hasPlatformAccess: !!role,
  };
}

// Single source of truth for resolving the effective display name of a user.
// Priority: explicit person displayName > person firstName + lastName >
// `users.name` (typically populated by OAuth providers) > `users.email`.
// Returns `undefined` when none of the sources is set; callers add their own
// final fallback when they need a guaranteed string.
export function getEffectiveUserName(args: {
  user: Pick<UserDoc, "name" | "email">;
  person: Pick<PersonDoc, "displayName" | "firstName" | "lastName"> | null;
}): string | undefined {
  return (
    getPersonDisplayName(args.person) ??
    args.user.name ??
    args.user.email ??
    undefined
  );
}

export async function buildCurrentUserResponse(ctx: Context, user: UserDoc) {
  const person = await getUserPersonOrNull(ctx, user);
  const { firstName, lastName } = getPersonNameParts(person);
  const avatarUrl = await getEffectivePersonAvatarUrl(ctx, {
    person,
    fallbackImage: user.image,
  });
  const platformRole = getEffectivePlatformRole(user);

  return {
    _id: user._id,
    _creationTime: user._creationTime,
    platformRole,
    firstName,
    lastName,
    name: getEffectiveUserName({ user, person }),
    image: user.image,
    avatarUrl,
    email: user.email,
    emailVerificationTime: user.emailVerificationTime,
    phone: user.phone,
    phoneVerificationTime: user.phoneVerificationTime,
    isAnonymous: user.isAnonymous,
    isPlatformAdmin: platformRole === "superadmin",
    canEditProfileName: await canEditOwnProfileName(ctx, user),
    hasUploadedAvatar: !!person?.imageStorageId,
  };
}

export function getDisplayUserName(args: {
  user: Pick<UserDoc, "name" | "email">;
  person: Pick<PersonDoc, "displayName" | "firstName" | "lastName"> | null;
}) {
  return getEffectiveUserName(args) ?? "User";
}

export async function requireUserById(ctx: Context, userId: UserDoc["_id"]) {
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throwAppError("USER_NOT_FOUND");
  }

  return user;
}

export async function getUserByPersonId(ctx: Context, personId: Id<"people">) {
  return await ctx.db
    .query("users")
    .withIndex("by_person_id", (query) => query.eq("personId", personId))
    .unique();
}

export async function requirePlatformMemberById(
  ctx: Context,
  userId: UserDoc["_id"],
) {
  const user = await requireUserById(ctx, userId);
  if (!getEffectivePlatformRole(user)) {
    throwAppError("PLATFORM_MEMBER_NOT_FOUND");
  }

  return user;
}

export async function requirePlatformSuperadminById(
  ctx: Context,
  userId: UserDoc["_id"],
) {
  const user = await requireUserById(ctx, userId);
  if (getEffectivePlatformRole(user) !== "superadmin") {
    throwAppError("UNAUTHORIZED");
  }

  return user;
}

// Sets the user's default organization only if none is set yet.
// Called when the user gets their first (or another) membership so the
// landing page has a single, stable target without scanning memberships.
export async function setUserDefaultOrganizationIfMissing(
  ctx: MutationCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
) {
  const user = await ctx.db.get("users", userId);
  if (!user || user.defaultOrganizationId) {
    return;
  }

  await ctx.db.patch("users", userId, {
    defaultOrganizationId: organizationId,
  });
}

// Called when a membership is removed. If the user's default points to the
// removed organization, picks another active membership (excluding the removed
// one) bounded by MAX_USER_MEMBERSHIPS_FOR_DEFAULT_REASSIGN. Clears the field
// when no replacement exists.
export async function reassignUserDefaultOrganizationIfMatches(
  ctx: MutationCtx,
  userId: Id<"users">,
  removedOrganizationId: Id<"organizations">,
) {
  const user = await ctx.db.get("users", userId);
  if (!user || user.defaultOrganizationId !== removedOrganizationId) {
    return;
  }

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_user_id_and_organization_id", (query) =>
      query.eq("userId", userId),
    )
    .take(MAX_USER_MEMBERSHIPS_FOR_DEFAULT_REASSIGN);

  let nextDefault: Id<"organizations"> | undefined;
  for (const membership of memberships) {
    if (membership.organizationId === removedOrganizationId) {
      continue;
    }
    const candidate = await ctx.db.get(
      "organizations",
      membership.organizationId,
    );
    if (candidate?.isActive) {
      nextDefault = candidate._id;
      break;
    }
  }

  await ctx.db.patch("users", userId, { defaultOrganizationId: nextDefault });
}
