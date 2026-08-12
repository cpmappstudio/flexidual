import { ConvexError, v } from "convex/values";
import {
  query,
  internalMutation,
  QueryCtx,
  MutationCtx,
  action,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { createClerkClient } from "@clerk/backend";
import {
  canManageCampusPeople,
  canViewCampusPeople,
  hasOrgRole,
  hasSystemRole,
  isPrincipalOfSchool,
} from "./permissions";
import { isRoleValidForOrganization, roleValidator } from "./model/roles";
import { isPasswordLongEnough } from "../lib/password";

const publicUserFields = {
  _id: v.id("users"),
  _creationTime: v.number(),
  clerkId: v.string(),
  email: v.optional(v.string()),
  username: v.optional(v.string()),
  firstName: v.string(),
  lastName: v.string(),
  fullName: v.string(),
  imageUrl: v.optional(v.string()),
  avatarStorageId: v.optional(v.id("_storage")),
  isActive: v.boolean(),
  createdAt: v.number(),
  lastLoginAt: v.optional(v.number()),
  grade: v.optional(v.string()),
  school: v.optional(v.string()),
};
const publicUserValidator = v.object(publicUserFields);
const internalUserValidator = v.object({
  ...publicUserFields,
  externalPassword: v.optional(v.string()),
});
const imageSyncUserValidator = v.object({
  _id: v.id("users"),
  clerkId: v.string(),
  imageUrl: v.optional(v.string()),
});
const imageSyncResultValidator = v.object({
  scanned: v.number(),
  updated: v.number(),
  skipped: v.number(),
  failed: v.number(),
});
const updateUserResultValidator = v.union(
  v.object({ status: v.literal("success") }),
  v.object({
    status: v.literal("error"),
    code: v.union(
      v.literal("PASSWORD_TOO_SHORT"),
      v.literal("PASSWORD_REJECTED"),
      v.literal("PASSWORD_UPDATE_FAILED"),
      v.literal("PASSWORD_UPDATE_UNAVAILABLE"),
    ),
    reason: v.optional(v.string()),
  }),
);

type UserJSON = {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string;
  last_name?: string;
  username?: string;
  image_url?: string;
  public_metadata?: { grade?: string; school?: string };
};

function getClerkClient(secretKey: string) {
  return createClerkClient({ secretKey });
}

function getClerkErrorReason(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("errors" in error) ||
    !Array.isArray(error.errors)
  ) {
    return null;
  }

  const firstError = error.errors[0];
  if (typeof firstError !== "object" || firstError === null) return null;

  const longMessage =
    "longMessage" in firstError ? firstError.longMessage : undefined;
  const message = "message" in firstError ? firstError.message : undefined;
  return typeof longMessage === "string"
    ? longMessage
    : typeof message === "string"
      ? message
      : null;
}

function toPublicUser(user: Doc<"users">) {
  const { externalPassword, ...publicUser } = user;
  void externalPassword;
  return publicUser;
}

async function deactivateUser(ctx: MutationCtx, user: Doc<"users">) {
  if (user.avatarStorageId) {
    await ctx.storage.delete(user.avatarStorageId).catch(() => undefined);
  }
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  await Promise.all(
    assignments.map((assignment) => ctx.db.delete(assignment._id)),
  );
  await ctx.db.patch(user._id, {
    email: undefined,
    username: undefined,
    firstName: "",
    lastName: "",
    fullName: "Deleted user",
    imageUrl: undefined,
    avatarStorageId: undefined,
    grade: undefined,
    school: undefined,
    isActive: false,
  });
}

function toUserJSON(clerkUser: {
  id: string;
  emailAddresses?: Array<{ emailAddress: string }>;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  publicMetadata?: Record<string, unknown>;
}): UserJSON {
  return {
    id: clerkUser.id,
    email_addresses: clerkUser.emailAddresses?.map((email) => ({
      email_address: email.emailAddress,
    })),
    first_name: clerkUser.firstName ?? undefined,
    last_name: clerkUser.lastName ?? undefined,
    username: clerkUser.username ?? undefined,
    image_url: clerkUser.imageUrl ?? undefined,
    public_metadata: {
      ...(typeof clerkUser.publicMetadata?.grade === "string"
        ? { grade: clerkUser.publicMetadata.grade }
        : {}),
      ...(typeof clerkUser.publicMetadata?.school === "string"
        ? { school: clerkUser.publicMetadata.school }
        : {}),
    },
  };
}

function profileImageFromDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid profile image");

  const [, mimeType, base64Data] = match;
  const byteString = atob(base64Data);
  const bytes = new Uint8Array(byteString.length);
  for (let index = 0; index < byteString.length; index++) {
    bytes[index] = byteString.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

// ============================================================================
// QUERIES
// ============================================================================

export const getCurrentUser = query({
  args: {},
  returns: v.union(publicUserValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUserFromAuth(ctx);
    return user ? toPublicUser(user) : null;
  },
});

export const getUsers = query({
  args: {
    role: v.optional(roleValidator),
    roles: v.optional(v.array(roleValidator)),
    isActive: v.optional(v.boolean()),
    orgType: v.optional(
      v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
    ),
    orgId: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      ...publicUserFields,
      role: v.optional(roleValidator),
      orgId: v.optional(v.string()),
      orgType: v.optional(
        v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const isSuperadmin = await hasSystemRole(ctx, currentUser._id, [
      "superadmin",
    ]);
    if (!args.orgType || args.orgType === "system") {
      if (!isSuperadmin) throw new ConvexError("PERMISSION_DENIED");
    } else if (!args.orgId) {
      throw new ConvexError("ORGANIZATION_REQUIRED");
    } else if (args.orgType === "school") {
      const schoolId = ctx.db.normalizeId("schools", args.orgId);
      const requestedRoles = args.roles ?? (args.role ? [args.role] : []);
      const canPrincipalReadAdministrativeBody =
        !!schoolId &&
        requestedRoles.length > 0 &&
        requestedRoles.every((role) =>
          (["admin", "principal"] as const).includes(
            role as "admin" | "principal",
          ),
        ) &&
        (await isPrincipalOfSchool(ctx, currentUser._id, schoolId));
      if (
        !schoolId ||
        (!isSuperadmin &&
          !(await hasOrgRole(ctx, currentUser._id, schoolId, "school", [
            "admin",
          ])) &&
          !canPrincipalReadAdministrativeBody)
      ) {
        throw new ConvexError("PERMISSION_DENIED");
      }
    } else {
      const campusId = ctx.db.normalizeId("campuses", args.orgId);
      const campus = campusId ? await ctx.db.get(campusId) : null;
      if (
        !campusId ||
        !campus ||
        !(await canViewCampusPeople(
          ctx,
          currentUser._id,
          campusId,
          campus.schoolId,
        ))
      ) {
        throw new ConvexError("PERMISSION_DENIED");
      }
    }

    let assignments = [];

    // 1. Hierarchical Role Fetching using Indexes
    if (args.orgType === "campus" && args.orgId) {
      assignments = await ctx.db
        .query("roleAssignments")
        .withIndex("by_org", (q) =>
          q.eq("orgId", args.orgId).eq("orgType", "campus"),
        )
        .collect();
    } else if (args.orgType === "school" && args.orgId) {
      // Get users assigned directly to the school (e.g., School Admins)
      const schoolAssignments = await ctx.db
        .query("roleAssignments")
        .withIndex("by_org", (q) =>
          q.eq("orgId", args.orgId).eq("orgType", "school"),
        )
        .collect();

      // Get all campuses for this school to find campus-level users (e.g., Teachers, Students)
      const campuses = await ctx.db
        .query("campuses")
        .withIndex("by_school", (q) =>
          q.eq("schoolId", args.orgId as Id<"schools">),
        )
        .collect();

      const campusAssignments = await Promise.all(
        campuses.map((c) =>
          ctx.db
            .query("roleAssignments")
            .withIndex("by_org", (q) =>
              q.eq("orgId", c._id).eq("orgType", "campus"),
            )
            .collect(),
        ),
      );

      assignments = [...schoolAssignments, ...campusAssignments.flat()];
    } else {
      // System level or no specific org filter
      assignments = await ctx.db.query("roleAssignments").collect();
    }

    // 2. Apply Role Filter
    const requestedRoles = args.roles ?? (args.role ? [args.role] : undefined);
    if (requestedRoles) {
      const roleSet = new Set(requestedRoles);
      assignments = assignments.filter((assignment) =>
        roleSet.has(assignment.role),
      );
    }

    const validUserIds = new Set(assignments.map((a) => a.userId));

    let users =
      (args.orgType && args.orgType !== "system") || requestedRoles
        ? (
            await Promise.all(
              [...validUserIds].map((userId) => ctx.db.get(userId)),
            )
          ).filter((user): user is Doc<"users"> => user !== null)
        : await ctx.db.query("users").collect();

    if (args.isActive !== undefined) {
      users = users.filter((u) => u.isActive === args.isActive);
    }

    // If we specified an orgType (not system) OR a role filter, strictly return only valid users
    if ((args.orgType && args.orgType !== "system") || requestedRoles) {
      return users
        .filter((u) => validUserIds.has(u._id))
        .map((u) => {
          const specificAssignment = assignments.find(
            (a) => a.userId === u._id,
          );
          return {
            ...toPublicUser(u),
            role: specificAssignment?.role,
            orgId: specificAssignment?.orgId,
            orgType: specificAssignment?.orgType,
            grade: specificAssignment?.gradeCode ?? u.grade,
          };
        });
    }

    // Global fallback (System Dashboard, All Users tab)
    return users.map((u) => {
      const userAssignments = assignments.filter((a) => a.userId === u._id);
      // Prefer their system assignment if they have one, else pick their first org assignment
      const bestAssignment =
        userAssignments.find((a) => a.orgType === "system") ||
        userAssignments[0];
      return {
        ...toPublicUser(u),
        role: bestAssignment?.role,
        orgId: bestAssignment?.orgId,
        orgType: bestAssignment?.orgType,
        grade: bestAssignment?.gradeCode ?? u.grade,
      };
    });
  },
});

export const getAvatarUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});

// ============================================================================
// MUTATIONS (Convex Only)
// ============================================================================

export const updateUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    updates: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
      school: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const updates: Partial<Doc<"users">> = {
      ...args.updates,
      avatarStorageId: args.updates.avatarStorageId ?? undefined,
      lastLoginAt: Date.now(),
    };

    if (args.updates.firstName || args.updates.lastName) {
      updates.fullName =
        `${args.updates.firstName || user.firstName} ${args.updates.lastName || user.lastName}`.trim();
    }

    if (updates.avatarStorageId === null) updates.avatarStorageId = undefined;

    await ctx.db.patch(args.userId, updates);
    return null;
  },
});

export const deleteUserInternal = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await deactivateUser(ctx, user);
    return null;
  },
});

// ============================================================================
// CLERK WEBHOOK HANDLERS
// ============================================================================

export const upsertFromClerk = internalMutation({
  args: {
    data: v.object({
      id: v.string(),
      email_addresses: v.optional(
        v.array(v.object({ email_address: v.string() })),
      ),
      first_name: v.optional(v.string()),
      last_name: v.optional(v.string()),
      username: v.optional(v.string()),
      image_url: v.optional(v.string()),
      public_metadata: v.optional(
        v.object({
          grade: v.optional(v.string()),
          school: v.optional(v.string()),
        }),
      ),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { data }: { data: UserJSON }) => {
    const email = data.email_addresses?.[0]?.email_address;
    const username = data.username ?? undefined;
    const firstName = data.first_name || "";
    const lastName = data.last_name || "";

    const publicMetadata = data.public_metadata || {};
    const school = publicMetadata.school;

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
      .unique();

    const userData = {
      clerkId: data.id,
      email: email || "",
      username: username,
      firstName,
      lastName,
      fullName:
        `${firstName} ${lastName}`.trim() ||
        email ||
        username ||
        "Unknown User",
      imageUrl: data.image_url ?? undefined,
      ...(typeof school === "string" ? { school } : {}),
      isActive: true,
      lastLoginAt: Date.now(),
    };

    if (existingUser) {
      await ctx.db.patch(existingUser._id, userData);
    } else {
      await ctx.db.insert("users", {
        ...userData,
        ...(typeof publicMetadata.grade === "string"
          ? { grade: publicMetadata.grade }
          : {}),
        ...(typeof publicMetadata.school === "string"
          ? { school: publicMetadata.school }
          : {}),
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
      .unique();

    if (user) {
      await deactivateUser(ctx, user);
    }
    return null;
  },
});

export const getUserInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(internalUserValidator, v.null()),
  handler: async (ctx, args) => await ctx.db.get(args.userId),
});

export const getUserByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(internalUserValidator, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique(),
});

export const assertCanManageUsers = internalQuery({
  args: {
    orgType: v.union(
      v.literal("system"),
      v.literal("school"),
      v.literal("campus"),
    ),
    orgId: v.optional(v.string()),
    roles: v.array(roleValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    if (
      args.roles.some((role) => !isRoleValidForOrganization(role, args.orgType))
    ) {
      throw new Error("Role is not valid for this organization level");
    }
    const isSuperadmin = await hasSystemRole(ctx, currentUser._id, [
      "superadmin",
    ]);
    if (args.orgType === "system" || args.roles.includes("superadmin")) {
      if (!isSuperadmin) throw new Error("Unauthorized");
      return null;
    }
    if (!args.orgId) throw new Error("Organization is required");

    if (args.orgType === "school") {
      const schoolId = ctx.db.normalizeId("schools", args.orgId);
      if (
        !schoolId ||
        (!isSuperadmin &&
          !(await hasOrgRole(ctx, currentUser._id, schoolId, "school", [
            "admin",
          ])))
      ) {
        throw new Error("Unauthorized");
      }
      return null;
    }

    const campusId = ctx.db.normalizeId("campuses", args.orgId);
    const campus = campusId ? await ctx.db.get(campusId) : null;
    if (
      campus &&
      args.roles.includes("principal") &&
      !isSuperadmin &&
      !(await hasOrgRole(ctx, currentUser._id, campus.schoolId, "school", [
        "admin",
      ]))
    ) {
      throw new Error("Unauthorized");
    }
    if (
      !campusId ||
      !campus ||
      !(await canManageCampusPeople(
        ctx,
        currentUser._id,
        campusId,
        campus.schoolId,
      ))
    ) {
      throw new Error("Unauthorized");
    }
    return null;
  },
});

// ============================================================================
// CLERK INTEGRATION ACTIONS
// ============================================================================

type CreateUserResult = {
  email?: string;
  identifier?: string;
  status: "success" | "error";
  reason?: string;
};

export const createUsersWithClerk = action({
  args: {
    users: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        username: v.optional(v.string()),
        password: v.optional(v.string()),
        role: roleValidator,
        grade: v.optional(v.string()),
        school: v.optional(v.string()),
        imageBase64: v.optional(v.string()),
      }),
    ),
    orgType: v.union(
      v.literal("system"),
      v.literal("school"),
      v.literal("campus"),
    ),
    orgId: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      email: v.optional(v.string()),
      identifier: v.optional(v.string()),
      status: v.union(v.literal("success"), v.literal("error")),
      reason: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args): Promise<CreateUserResult[]> => {
    await ctx.runQuery(internal.users.assertCanManageUsers, {
      orgType: args.orgType,
      orgId: args.orgId,
      roles: args.users.map((user) => user.role),
    });
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");
    const clerk = getClerkClient(clerkSecretKey);

    const invalidGradeCodes: string[] = await ctx.runQuery(
      internal.grades.validateForOrganization,
      {
        orgType: args.orgType,
        orgId: args.orgId,
        codes: args.users.flatMap((user) => (user.grade ? [user.grade] : [])),
      },
    );
    const invalidGrades = new Set<string>(invalidGradeCodes);
    const results: CreateUserResult[] = [];

    for (const user of args.users) {
      let createdClerkUserId: string | undefined;
      try {
        const email = user.email?.trim() || undefined;
        const username = user.username?.trim() || undefined;
        const isStudent = user.role === "student";

        if (isStudent) {
          if (!email && !username) {
            throw new Error("Students require an email or username");
          }
          if (!user.password) {
            throw new Error("A password is required");
          }
        } else {
          if (!email || !user.password) {
            throw new Error("An email and password are required for staff");
          }
          if (username) {
            throw new Error("Usernames are only available for students");
          }
        }
        if (isStudent && !user.grade) {
          throw new Error("A grade is required for students");
        }
        if (user.grade && invalidGrades.has(user.grade)) {
          results.push({
            identifier: user.email || user.username,
            status: "error",
            reason: `Invalid grade: ${user.grade}`,
          });
          continue;
        }

        let clerkUser = await clerk.users.createUser({
          firstName: user.firstName,
          lastName: user.lastName,
          emailAddress: email ? [email] : undefined,
          username: isStudent ? username : undefined,
          password: user.password || undefined,
          publicMetadata: {},
        });
        createdClerkUserId = clerkUser.id;

        if (user.imageBase64) {
          clerkUser = await clerk.users.updateUserProfileImage(clerkUser.id, {
            file: profileImageFromDataUrl(user.imageBase64),
          });
        }

        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: toUserJSON(clerkUser),
        });

        const newConvexUser = await ctx.runQuery(
          internal.users.getUserByClerkIdInternal,
          { clerkId: clerkUser.id },
        );
        if (!newConvexUser)
          throw new Error("Failed to sync identity to database");

        await ctx.runMutation(internal.roleAssignments.assignRoleInternal, {
          userId: newConvexUser._id,
          orgType: args.orgType,
          orgId: args.orgId,
          role: user.role,
          gradeCode: user.role === "student" ? user.grade : undefined,
        });

        if (username || user.school) {
          await ctx.runMutation(internal.users.updateUserInternal, {
            userId: newConvexUser._id,
            updates: {
              username: isStudent ? username : undefined,
              school: user.school,
            },
          });
        }

        results.push({ email, status: "success" });
      } catch (error) {
        if (createdClerkUserId) {
          try {
            await clerk.users.deleteUser(createdClerkUserId);
          } catch (cleanupError) {
            console.error(
              `Failed to roll back Clerk user ${createdClerkUserId}`,
              cleanupError,
            );
          }

          try {
            const convexUser = await ctx.runQuery(
              internal.users.getUserByClerkIdInternal,
              { clerkId: createdClerkUserId },
            );
            if (convexUser) {
              await ctx.runMutation(internal.users.deleteUserInternal, {
                userId: convexUser._id,
              });
            }
          } catch (cleanupError) {
            console.error(
              `Failed to roll back Convex user ${createdClerkUserId}`,
              cleanupError,
            );
          }
        }

        results.push({
          identifier: user.email || user.username,
          status: "error",
          reason:
            error instanceof Error ? error.message : "User creation failed",
        });
      }
    }

    return results;
  },
});

export const updateUserWithClerk = action({
  args: {
    userId: v.id("users"),
    updates: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      password: v.optional(v.string()),
      role: v.optional(roleValidator),
      grade: v.optional(v.string()),
      school: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
      imageBase64: v.optional(v.string()),
    }),
    // Context required to update the correct role assignment
    orgType: v.union(
      v.literal("system"),
      v.literal("school"),
      v.literal("campus"),
    ),
    orgId: v.optional(v.string()),
  },
  returns: updateUserResultValidator,
  handler: async (ctx, args) => {
    const targetAssignment = await ctx.runQuery(
      internal.roleAssignments.getAssignmentInternal,
      {
        userId: args.userId,
        orgType: args.orgType,
        orgId: args.orgId,
      },
    );
    if (!targetAssignment)
      throw new Error("User is not a member of this organization");
    await ctx.runQuery(internal.users.assertCanManageUsers, {
      orgType: args.orgType,
      orgId: args.orgId,
      roles: args.updates.role
        ? [targetAssignment.role, args.updates.role]
        : [targetAssignment.role],
    });
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");
    const clerk = getClerkClient(clerkSecretKey);

    const user = await ctx.runQuery(internal.users.getUserInternal, {
      userId: args.userId,
    });
    if (!user) throw new Error("User not found");
    const effectiveRole = args.updates.role ?? targetAssignment.role;
    const effectiveGrade = args.updates.grade ?? targetAssignment.gradeCode;
    if (effectiveRole !== "student" && args.updates.username) {
      throw new Error("Usernames are only available for students");
    }
    if (effectiveRole !== "student" && !(args.updates.email ?? user.email)) {
      throw new Error("An email is required for staff");
    }
    if (effectiveRole === "student" && !effectiveGrade) {
      throw new Error("A grade is required for students");
    }

    if (args.updates.grade) {
      const invalidGrades = await ctx.runQuery(
        internal.grades.validateForOrganization,
        {
          orgType: args.orgType,
          orgId: args.orgId,
          codes: [args.updates.grade],
        },
      );
      if (invalidGrades.length > 0) {
        throw new Error(`Invalid grade: ${args.updates.grade}`);
      }
    }

    if (args.updates.password) {
      if (!isPasswordLongEnough(args.updates.password)) {
        return { status: "error", code: "PASSWORD_TOO_SHORT" } as const;
      }
      if (user.clerkId.startsWith("temp_")) {
        return {
          status: "error",
          code: "PASSWORD_UPDATE_UNAVAILABLE",
        } as const;
      }

      try {
        await clerk.users.updateUser(user.clerkId, {
          password: args.updates.password,
          signOutOfOtherSessions: true,
        });
      } catch (error) {
        const reason = getClerkErrorReason(error);
        if (!reason) {
          console.error("Failed to update Clerk user password", error);
        }
        return {
          status: "error",
          code: reason ? "PASSWORD_REJECTED" : "PASSWORD_UPDATE_FAILED",
          reason: reason ?? undefined,
        } as const;
      }
    }

    // Update Clerk first; its webhook remains an eventual reconciliation path.
    if (!user.clerkId.startsWith("temp_")) {
      if (
        args.updates.firstName ||
        args.updates.lastName ||
        args.updates.username
      ) {
        await clerk.users.updateUser(user.clerkId, {
          firstName: args.updates.firstName,
          lastName: args.updates.lastName,
          username: args.updates.username,
        });
      }

      if (args.updates.imageBase64) {
        const refreshedClerkUser = await clerk.users.updateUserProfileImage(
          user.clerkId,
          { file: profileImageFromDataUrl(args.updates.imageBase64) },
        );
        await ctx.runMutation(internal.users.patchUserImageUrl, {
          userId: args.userId,
          imageUrl: refreshedClerkUser.imageUrl ?? undefined,
        });
      }

      if (args.updates.email && args.updates.email !== user.email) {
        const clerkUser = await clerk.users.getUser(user.clerkId);
        let newEmail = clerkUser.emailAddresses.find(
          (email) => email.emailAddress === args.updates.email,
        );
        if (!newEmail) {
          newEmail = await clerk.emailAddresses.createEmailAddress({
            userId: user.clerkId,
            emailAddress: args.updates.email,
            verified: true,
          });
        }
        await clerk.emailAddresses.updateEmailAddress(newEmail.id, {
          verified: true,
          primary: true,
        });
        const oldEmails = clerkUser.emailAddresses.filter(
          (email) => email.id !== newEmail.id,
        );
        for (const old of oldEmails) {
          await clerk.emailAddresses.deleteEmailAddress(old.id);
        }
      }
    }

    await ctx.runMutation(internal.users.updateUserInternal, {
      userId: args.userId,
      updates: {
        firstName: args.updates.firstName,
        lastName: args.updates.lastName,
        email: args.updates.email,
        username: args.updates.username,
        school: args.updates.school,
        isActive: args.updates.isActive,
      },
    });

    if (args.updates.role || args.updates.grade !== undefined) {
      await ctx.runMutation(internal.roleAssignments.assignRoleInternal, {
        userId: args.userId,
        orgType: args.orgType,
        orgId: args.orgId,
        role: effectiveRole,
        gradeCode: effectiveRole === "student" ? effectiveGrade : undefined,
      });
    }
    return { status: "success" } as const;
  },
});

export const deleteUserWithClerk = action({
  args: {
    userId: v.id("users"),
    orgType: v.union(
      v.literal("system"),
      v.literal("school"),
      v.literal("campus"),
    ),
    orgId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assignment = await ctx.runQuery(
      internal.roleAssignments.getAssignmentInternal,
      args,
    );
    if (!assignment)
      throw new Error("User is not a member of this organization");
    await ctx.runQuery(internal.users.assertCanManageUsers, {
      orgType: args.orgType,
      orgId: args.orgId,
      roles: [assignment.role],
    });
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");

    const user = await ctx.runQuery(internal.users.getUserInternal, {
      userId: args.userId,
    });
    if (!user) throw new Error("User not found");

    if (user.clerkId.startsWith("temp_")) {
      await ctx.runMutation(internal.users.deleteUserInternal, {
        userId: args.userId,
      });
      return null;
    }

    const clerk = getClerkClient(clerkSecretKey);
    try {
      await clerk.users.deleteUser(user.clerkId);
    } catch (error) {
      const isAlreadyDeleted =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 404;
      if (!isAlreadyDeleted) throw error;
    }
    await ctx.runMutation(internal.users.deleteUserInternal, {
      userId: args.userId,
    });
    return null;
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export async function getCurrentUserOrThrow(ctx: QueryCtx) {
  const user = await getCurrentUserFromAuth(ctx);
  if (!user) throw new Error("User not authenticated");
  return user;
}

export async function getCurrentUserFromAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  return user?.isActive ? user : null;
}

export const getAllUsersInternal = internalQuery({
  args: {},
  returns: v.array(internalUserValidator),
  handler: async (ctx) => await ctx.db.query("users").collect(),
});

export const getStudentUsersInternal = internalQuery({
  args: {},
  returns: v.array(imageSyncUserValidator),
  handler: async (ctx) => {
    const assignments = await ctx.db.query("roleAssignments").collect();
    const studentUserIds = new Set(
      assignments
        .filter((assignment) => assignment.role === "student")
        .map((assignment) => assignment.userId),
    );

    const students = [];
    for (const userId of studentUserIds) {
      const user = await ctx.db.get(userId);
      if (user) {
        students.push({
          _id: user._id,
          clerkId: user.clerkId,
          imageUrl: user.imageUrl,
        });
      }
    }

    return students;
  },
});

export const getUsersForImageSyncInternal = internalQuery({
  args: {},
  returns: v.array(imageSyncUserValidator),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((user) => ({
      _id: user._id,
      clerkId: user.clerkId,
      imageUrl: user.imageUrl,
    }));
  },
});

export const patchUserImageUrl = internalMutation({
  args: {
    userId: v.id("users"),
    imageUrl: v.optional(v.string()),
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    if (user.imageUrl === args.imageUrl) {
      return { updated: false };
    }

    await ctx.db.patch(args.userId, { imageUrl: args.imageUrl });
    return { updated: true };
  },
});

export const syncAllStudentImages = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.users.syncAllStudentImagesWorker,
      {},
    );
    return { scheduled: true };
  },
});

export const syncAllStudentImagesWorker = internalAction({
  args: {},
  returns: imageSyncResultValidator,
  handler: async (ctx) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");

    const clerk = getClerkClient(clerkSecretKey);
    const students = await ctx.runQuery(
      internal.users.getStudentUsersInternal,
      {},
    );

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const student of students) {
      if (student.clerkId.startsWith("temp_")) {
        skipped++;
        continue;
      }

      scanned++;
      try {
        const clerkUser = await clerk.users.getUser(student.clerkId);
        const clerkImageUrl = clerkUser.imageUrl ?? undefined;

        if (student.imageUrl !== clerkImageUrl) {
          await ctx.runMutation(internal.users.patchUserImageUrl, {
            userId: student._id,
            imageUrl: clerkImageUrl,
          });
          updated++;
        }
      } catch (error) {
        console.error(
          `Failed to sync student image for ${student.clerkId}:`,
          error,
        );
        failed++;
      }
    }

    return { scanned, updated, skipped, failed };
  },
});

export const syncAllUserImages = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.users.syncAllUserImagesWorker, {});
    return { scheduled: true };
  },
});

export const syncAllUserImagesWorker = internalAction({
  args: {},
  returns: imageSyncResultValidator,
  handler: async (ctx) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");

    const clerk = getClerkClient(clerkSecretKey);
    const users = await ctx.runQuery(
      internal.users.getUsersForImageSyncInternal,
      {},
    );

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      if (user.clerkId.startsWith("temp_")) {
        skipped++;
        continue;
      }

      scanned++;
      try {
        const clerkUser = await clerk.users.getUser(user.clerkId);
        const clerkImageUrl = clerkUser.imageUrl ?? undefined;

        if (user.imageUrl !== clerkImageUrl) {
          await ctx.runMutation(internal.users.patchUserImageUrl, {
            userId: user._id,
            imageUrl: clerkImageUrl,
          });
          updated++;
        }
      } catch (error) {
        console.error(`Failed to sync image for ${user.clerkId}:`, error);
        failed++;
      }
    }

    return { scanned, updated, skipped, failed };
  },
});
