import {
  getAuthSessionId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { throwAppError } from "./lib/errors";

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [currentUser, currentSessionId] = await Promise.all([
      ctx.runQuery(internal.users.getCurrentActionUserInternal, {}),
      getAuthSessionId(ctx),
    ]);

    if (!currentUser || !currentSessionId) {
      throwAppError("NOT_AUTHENTICATED");
    }

    if (!currentUser.email) {
      throwAppError("ACCOUNT_EMAIL_REQUIRED");
    }

    if (args.newPassword.length < 8) {
      throwAppError("PASSWORD_TOO_SHORT");
    }

    if (args.currentPassword === args.newPassword) {
      throwAppError("PASSWORD_UNCHANGED");
    }

    try {
      const account = await retrieveAccount(ctx, {
        provider: "password",
        account: {
          id: currentUser.email,
          secret: args.currentPassword,
        },
      });

      if (account.user._id !== currentUser._id) {
        throwAppError("INVALID_CURRENT_PASSWORD");
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (
        error.message === "InvalidSecret" ||
        error.message === "InvalidAccountId"
      ) {
        throwAppError("INVALID_CURRENT_PASSWORD");
      }

      if (error.message === "TooManyFailedAttempts") {
        throwAppError("TOO_MANY_FAILED_ATTEMPTS");
      }

      throw error;
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: currentUser.email,
        secret: args.newPassword,
      },
    });

    await invalidateSessions(ctx, {
      userId: currentUser._id,
      except: [currentSessionId],
    });

    return null;
  },
});

export const resetOrganizationPersonPassword = action({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
    accountScope: v.optional(
      v.union(v.literal("self"), v.literal("withGuardianFallback")),
    ),
    newPassword: v.string(),
    signOutAllSessions: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8) {
      throwAppError("PASSWORD_TOO_SHORT");
    }

    const target = await ctx.runQuery(
      internal.platform.people.getOrganizationPersonPasswordResetTargetInternal,
      {
        slug: args.slug,
        organizationPersonId: args.organizationPersonId,
        accountScope: args.accountScope,
      },
    );

    if (!target) {
      throwAppError("ORGANIZATION_PERSON_ACCOUNT_NOT_FOUND");
    }

    try {
      const account = await retrieveAccount(ctx, {
        provider: "password",
        account: {
          id: target.email,
        },
      });

      if (account.user._id !== target.userId) {
        throwAppError("ORGANIZATION_PERSON_ACCOUNT_MISMATCH");
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (error.message === "InvalidAccountId") {
        throwAppError("ORGANIZATION_PERSON_PASSWORD_ACCOUNT_NOT_FOUND");
      }

      throw error;
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: target.email,
        secret: args.newPassword,
      },
    });

    if (args.signOutAllSessions) {
      await invalidateSessions(ctx, {
        userId: target.userId,
      });
    }

    return null;
  },
});

export const signOutOtherSessions = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const [currentUser, currentSessionId] = await Promise.all([
      ctx.runQuery(internal.users.getCurrentActionUserInternal, {}),
      getAuthSessionId(ctx),
    ]);

    if (!currentUser || !currentSessionId) {
      throwAppError("NOT_AUTHENTICATED");
    }

    await invalidateSessions(ctx, {
      userId: currentUser._id,
      except: [currentSessionId],
    });

    return null;
  },
});

export const signOutSession = action({
  args: {
    sessionId: v.id("authSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [currentUser, currentSessionId, ownsSession] = await Promise.all([
      ctx.runQuery(internal.users.getCurrentActionUserInternal, {}),
      getAuthSessionId(ctx),
      ctx.runQuery(internal.users.verifySessionOwnershipInternal, {
        sessionId: args.sessionId,
      }),
    ]);

    if (!currentUser || !currentSessionId) {
      throwAppError("NOT_AUTHENTICATED");
    }

    if (args.sessionId === currentSessionId) {
      throwAppError("CURRENT_SESSION_NOT_SUPPORTED");
    }

    if (!ownsSession) {
      throwAppError("SESSION_NOT_FOUND");
    }

    // `invalidateSessions` invalidates every session of the user that is
    // *not* in `except`, so we have to enumerate the rest. The list is
    // bounded by `MAX_USER_SESSIONS_FOR_INVALIDATE_EXCEPT`; sessions
    // beyond that cap are invalidated as benign cleanup.
    const sessionIds = await ctx.runQuery(
      internal.users.listMySessionIdsInternal,
      {},
    );

    // The current session is unconditionally preserved: it must end up in
    // `except` even when it sits outside the bounded `sessionIds` page,
    // otherwise we would log the caller out as a side effect of signing
    // out an unrelated session.
    const exceptSessionIds = new Set(sessionIds);
    exceptSessionIds.add(currentSessionId);
    exceptSessionIds.delete(args.sessionId);

    await invalidateSessions(ctx, {
      userId: currentUser._id,
      except: Array.from(exceptSessionIds),
    });

    return null;
  },
});
