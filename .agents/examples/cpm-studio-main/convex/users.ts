import { getAuthSessionId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  buildCurrentUserResponse,
  canEditOwnProfileName,
  getEffectivePlatformRole,
} from "./lib/users";
import {
  getCurrentUserOrNull,
  requireCurrentUser,
  requireCurrentUserId,
} from "./lib/auth";
import {
  deleteStoredAvatarIfPresent,
  getPersonNameParts,
  getUserPersonOrNull,
  savePersonProfileForUser,
} from "./lib/people";
import { getCurrentOrganizationAccess } from "./lib/authz";
import { avatarChangeValidator } from "./lib/validators";
import { MAX_USER_SESSIONS_FOR_INVALIDATE_EXCEPT } from "./lib/queryLimits";
import { throwAppError } from "./lib/errors";

const currentUserValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  platformRole: v.optional(
    v.union(v.literal("superadmin"), v.literal("viewer")),
  ),
  firstName: v.string(),
  lastName: v.string(),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  avatarUrl: v.union(v.string(), v.null()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  isPlatformAdmin: v.boolean(),
  canEditProfileName: v.boolean(),
  hasUploadedAvatar: v.boolean(),
});

const actionUserContextValidator = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  platformRole: v.optional(
    v.union(v.literal("superadmin"), v.literal("viewer")),
  ),
  isPlatformAdmin: v.boolean(),
});

const sessionSummaryValidator = v.object({
  _id: v.id("authSessions"),
  _creationTime: v.number(),
  expirationTime: v.number(),
  isCurrent: v.boolean(),
});

export const current = query({
  args: {},
  returns: v.union(currentUserValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);

    if (!user) {
      return null;
    }

    return await buildCurrentUserResponse(ctx, user);
  },
});

export const canUseTenantSignIn = query({
  args: {
    slug: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return false;
    }

    return !!(await getCurrentOrganizationAccess(ctx, args.slug));
  },
});

export const getCurrentActionUserInternal = internalQuery({
  args: {},
  returns: v.union(actionUserContextValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return null;
    }

    return {
      _id: user._id,
      email: user.email,
      platformRole: getEffectivePlatformRole(user),
      isPlatformAdmin: getEffectivePlatformRole(user) === "superadmin",
    };
  },
});

// Returns up to `MAX_USER_SESSIONS_FOR_INVALIDATE_EXCEPT` of the current
// user's session ids, ordered most recent first. Used solely to build the
// `except` argument of `invalidateSessions` when signing out a single
// session; ownership of the target session is verified separately via
// `verifySessionOwnershipInternal`, which is reliable regardless of cap.
export const listMySessionIdsInternal = internalQuery({
  args: {},
  returns: v.array(v.id("authSessions")),
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (query) => query.eq("userId", userId))
      .order("desc")
      .take(MAX_USER_SESSIONS_FOR_INVALIDATE_EXCEPT);

    return sessions.map((session) => session._id);
  },
});

// O(1) ownership check for the current user. Returns `true` when the
// session exists and belongs to the caller. Used by sign-out flows that
// would otherwise have to scan every session just to validate the target.
export const verifySessionOwnershipInternal = internalQuery({
  args: {
    sessionId: v.id("authSessions"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const session = await ctx.db.get("authSessions", args.sessionId);
    return session?.userId === userId;
  },
});

export const saveProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    avatarChange: avatarChangeValidator,
  },
  returns: currentUserValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const canEditName = await canEditOwnProfileName(ctx, user);
    let firstName = args.firstName;
    let lastName = args.lastName;

    if (!canEditName) {
      const person = await getUserPersonOrNull(ctx, user);
      const currentName = getPersonNameParts(person);
      const requestedFirstName = args.firstName.trim();
      const requestedLastName = args.lastName.trim();

      if (
        requestedFirstName !== currentName.firstName ||
        requestedLastName !== currentName.lastName
      ) {
        throwAppError("PROFILE_NAME_CHANGE_NOT_ALLOWED");
      }

      firstName = currentName.firstName;
      lastName = currentName.lastName;
    }

    const updatedUser = await savePersonProfileForUser(ctx, {
      user,
      firstName,
      lastName,
      avatarChange: args.avatarChange,
    });

    return await buildCurrentUserResponse(ctx, updatedUser);
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireCurrentUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const discardAvatarUpload = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCurrentUserId(ctx);
    await deleteStoredAvatarIfPresent(ctx, args.storageId);
    return null;
  },
});

export const listMySessions = query({
  args: {},
  returns: v.array(sessionSummaryValidator),
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const currentSessionId = await getAuthSessionId(ctx);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (query) => query.eq("userId", userId))
      .order("desc")
      .take(20);

    return sessions.map((session) => ({
      _id: session._id,
      _creationTime: session._creationTime,
      expirationTime: session.expirationTime,
      isCurrent: currentSessionId === session._id,
    }));
  },
});
