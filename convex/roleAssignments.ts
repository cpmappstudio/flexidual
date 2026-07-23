import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./users";
import { canManageClasses, hasOrgRole, hasSystemRole } from "./permissions";
import { validateGradeCodes } from "./model/grades";
import { resolveMembershipSchoolId } from "./model/membership";
import { isRoleValidForOrganization, roleValidator } from "./model/roles";

const roleAssignmentValidator = v.object({
  _id: v.id("roleAssignments"),
  _creationTime: v.number(),
  userId: v.id("users"),
  orgId: v.optional(v.string()),
  orgType: v.union(
    v.literal("system"),
    v.literal("school"),
    v.literal("campus"),
  ),
  role: roleValidator,
  schoolId: v.optional(v.id("schools")),
  gradeCode: v.optional(v.string()),
  assignedAt: v.number(),
  assignedBy: v.optional(v.id("users")),
});

async function assertCanManageAssignment(
  ctx: Parameters<typeof hasSystemRole>[0],
  userId: Id<"users">,
  orgType: "system" | "school" | "campus",
  orgId: string | undefined,
  role: string,
) {
  const isSuperadmin = await hasSystemRole(ctx, userId, ["superadmin"]);
  if (isSuperadmin) return;
  if (orgType === "system" || role === "superadmin") {
    throw new Error("Unauthorized");
  }
  if (!orgId) throw new Error("Organization is required");

  if (orgType === "school") {
    const schoolId = ctx.db.normalizeId("schools", orgId);
    if (
      !schoolId ||
      !(await hasOrgRole(ctx, userId, schoolId, "school", ["admin"]))
    ) {
      throw new Error("Unauthorized");
    }
    return;
  }

  const campusId = ctx.db.normalizeId("campuses", orgId);
  const campus = campusId ? await ctx.db.get(campusId) : null;
  if (
    campus &&
    role === "principal" &&
    !(await hasOrgRole(ctx, userId, campus.schoolId, "school", ["admin"]))
  ) {
    throw new Error("Unauthorized");
  }
  if (
    !campusId ||
    !campus ||
    !(await canManageClasses(ctx, userId, campusId, campus.schoolId))
  ) {
    throw new Error("Unauthorized");
  }
}

async function assignmentData(
  ctx: Parameters<typeof hasSystemRole>[0],
  args: {
    orgType: "system" | "school" | "campus";
    orgId?: string;
    role: "superadmin" | "admin" | "principal" | "teacher" | "tutor" | "student";
    gradeCode?: string;
  },
) {
  if (!isRoleValidForOrganization(args.role, args.orgType)) {
    throw new Error("Role is not valid for this organization level");
  }
  const schoolId = await resolveMembershipSchoolId(
    ctx,
    args.orgType,
    args.orgId,
  );
  if (args.orgType !== "system" && !schoolId) {
    throw new Error("Invalid organization");
  }
  if (args.role === "student") {
    if (!args.gradeCode) throw new Error("A grade is required for students");
    if (
      !schoolId ||
      (await validateGradeCodes(ctx, schoolId, [args.gradeCode])).length > 0
    ) {
      throw new Error("Invalid grade");
    }
  }
  return {
    schoolId,
    gradeCode: args.role === "student" ? args.gradeCode : undefined,
  };
}

async function scheduleRoleSync(
  ctx: MutationCtx,
  userIds: Iterable<Id<"users">>,
) {
  for (const userId of new Set(userIds)) {
    const user = await ctx.db.get(userId);
    if (user && !user.clerkId.startsWith("temp_")) {
      await ctx.scheduler.runAfter(0, internal.roleAssignments.syncRolesToClerk, {
        userId,
        clerkId: user.clerkId,
      });
    }
  }
}

export async function upsertRoleAssignment(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    orgType: "system" | "school" | "campus";
    orgId?: string;
    role: "superadmin" | "admin" | "principal" | "teacher" | "tutor" | "student";
    gradeCode?: string;
  },
  assignedBy?: Id<"users">,
) {
  const contextual = await assignmentData(ctx, args);
  const affectedUsers = new Set<Id<"users">>([args.userId]);

  if (args.role === "superadmin") {
    const existingAssignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const assignment of existingAssignments) {
      if (assignment.orgType !== "system" || assignment.role !== "superadmin") {
        await ctx.db.delete(assignment._id);
      }
    }
  }

  if (args.role === "principal" && args.orgType === "campus" && args.orgId) {
    const campusAssignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_org", (q) =>
        q.eq("orgId", args.orgId).eq("orgType", "campus"),
      )
      .collect();
    for (const assignment of campusAssignments) {
      if (
        assignment.role === "principal" &&
        assignment.userId !== args.userId
      ) {
        affectedUsers.add(assignment.userId);
        await ctx.db.delete(assignment._id);
      }
    }
  }

  const existing = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user_org", (q) =>
      q
        .eq("userId", args.userId)
        .eq("orgId", args.orgId)
        .eq("orgType", args.orgType),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      role: args.role,
      ...contextual,
      assignedAt: Date.now(),
      assignedBy,
    });
  } else {
    await ctx.db.insert("roleAssignments", {
      userId: args.userId,
      orgType: args.orgType,
      orgId: args.orgId,
      role: args.role,
      ...contextual,
      assignedAt: Date.now(),
      assignedBy,
    });
  }

  await scheduleRoleSync(ctx, affectedUsers);
}

export async function clearCampusPrincipalAssignments(
  ctx: MutationCtx,
  campusId: Id<"campuses">,
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_org", (q) =>
      q.eq("orgId", campusId).eq("orgType", "campus"),
    )
    .collect();
  const principals = assignments.filter(
    (assignment) => assignment.role === "principal",
  );
  await Promise.all(
    principals.map((assignment) => ctx.db.delete(assignment._id)),
  );
  await scheduleRoleSync(
    ctx,
    principals.map((assignment) => assignment.userId),
  );
}

// ============================================================================
// INTERNAL HELPERS (For Syncing to Clerk)
// ============================================================================

export const getUserAssignmentsInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(roleAssignmentValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getOrgSlugInternal = internalQuery({
  args: {
    orgId: v.string(),
    orgType: v.union(v.literal("school"), v.literal("campus")),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (args.orgType === "school") {
      const school = await ctx.db.get(args.orgId as Id<"schools">);
      return school?.slug ?? null;
    }
    if (args.orgType === "campus") {
      const campus = await ctx.db.get(args.orgId as Id<"campuses">);
      return campus?.slug ?? null;
    }
    return null;
  },
});

/**
 * Rebuilds the user's role dictionary and pushes it to Clerk's public_metadata.
 * Example payload sent to Clerk:
 * { roles: { "system": "superadmin", "boston-public": "admin", "north-campus": "teacher" } }
 */
export const syncRolesToClerk = internalAction({
  args: { userId: v.id("users"), clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");

    if (args.clerkId.startsWith("temp_")) return null;

    // 1. Fetch all their role assignments
    const assignments = await ctx.runQuery(internal.roleAssignments.getUserAssignmentsInternal, { 
      userId: args.userId 
    });

    // 2. Build the dictionary map
    const rolesMap: Record<string, string> = {};

    // Superadmins are global — no org-specific roles needed in metadata.
    const isSuperadmin = assignments.some(
      (assignment: { orgType: string; role: string }) =>
        assignment.orgType === "system" && assignment.role === "superadmin",
    );
    if (isSuperadmin) {
      rolesMap["system"] = "superadmin";
    } else {
      for (const assignment of assignments) {
        if (assignment.orgType === "system") {
          rolesMap["system"] = assignment.role;
        } else if (assignment.orgId) {
          // Fetch the slug for the school or campus to use as the key
          const slug = await ctx.runQuery(internal.roleAssignments.getOrgSlugInternal, { 
            orgId: assignment.orgId, 
            orgType: assignment.orgType 
          });
          if (slug) rolesMap[slug] = assignment.role;
        }
      }
    }

    // 3. Push to Clerk
    const response = await fetch(`https://api.clerk.com/v1/users/${args.clerkId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        public_metadata: { roles: rolesMap },
      }),
    });
    if (!response.ok) throw new Error("Clerk role synchronization failed");
    return null;
  },
});

// Returns all role assignments for a given org — used when a slug changes.
export const getOrgAssignmentsInternal = internalQuery({
  args: {
    orgId: v.string(),
    orgType: v.union(v.literal("school"), v.literal("campus")),
  },
  returns: v.array(roleAssignmentValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roleAssignments")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId).eq("orgType", args.orgType))
      .collect();
  },
});

// Re-syncs Clerk metadata for every user in an org.
// Triggered automatically when a school or campus slug is renamed.
export const syncOrgUsersToClerk = internalAction({
  args: {
    orgId: v.string(),
    orgType: v.union(v.literal("school"), v.literal("campus")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assignments = await ctx.runQuery(internal.roleAssignments.getOrgAssignmentsInternal, args);
    const seen = new Set<string>();
    for (const assignment of assignments) {
      const uid = assignment.userId as string;
      if (seen.has(uid)) continue;
      seen.add(uid);
      const user = await ctx.runQuery(internal.users.getUserInternal, {
        userId: assignment.userId,
      });
      if (user && !user.clerkId.startsWith("temp_")) {
        await ctx.runAction(internal.roleAssignments.syncRolesToClerk, {
          userId: assignment.userId,
          clerkId: user.clerkId,
        });
      }
    }
    return null;
  },
});

// Rebuilds Clerk public_metadata.roles for EVERY user from the Convex roleAssignments table.
// Run this once to heal all corrupted metadata after the grade/school metadata bug.
export const healAllUserRoles = action({
  args: {},
  returns: v.object({
    synced: v.number(),
    skipped: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx) => {
    await ctx.runQuery(internal.users.assertCanManageUsers, {
      orgType: "system",
      roles: ["superadmin"],
    });
    const users = await ctx.runQuery(internal.users.getAllUsersInternal);
    let synced = 0, skipped = 0, errors = 0;
    for (const user of users) {
      if (user.clerkId.startsWith("temp_")) { skipped++; continue; }
      try {
        await ctx.runAction(internal.roleAssignments.syncRolesToClerk, {
          userId: user._id,
          clerkId: user.clerkId,
        });
        synced++;
      } catch (e) {
        errors++;
        console.error(`Failed to sync user ${user._id} (${user.clerkId}):`, e);
      }
    }
    return { synced, skipped, errors };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const assignRole = mutation({
  args: {
    userId: v.id("users"),
    orgType: v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
    orgId: v.optional(v.string()), 
    role: roleValidator,
    gradeCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    await assertCanManageAssignment(
      ctx,
      currentUser._id,
      args.orgType,
      args.orgId,
      args.role,
    );
    await upsertRoleAssignment(ctx, args, currentUser._id);
    return null;
  },
});

export const assignRoleInternal = internalMutation({
  args: {
    userId: v.id("users"),
    orgType: v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
    orgId: v.optional(v.string()), 
    role: roleValidator,
    gradeCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertRoleAssignment(ctx, args);
    return null;
  },
});

export const getUserRoles = query({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("roleAssignments"),
      _creationTime: v.number(),
      userId: v.id("users"),
      orgId: v.optional(v.string()),
      orgType: v.union(
        v.literal("system"),
        v.literal("school"),
        v.literal("campus"),
      ),
      role: roleValidator,
      schoolId: v.optional(v.id("schools")),
      gradeCode: v.optional(v.string()),
      assignedAt: v.number(),
      assignedBy: v.optional(v.id("users")),
    }),
  ),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const isSuperadmin = await hasSystemRole(ctx, currentUser._id, [
      "superadmin",
    ]);
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    if (isSuperadmin) return assignments;

    const visible = [];
    for (const assignment of assignments) {
      if (!assignment.orgId || assignment.orgType === "system") continue;
      if (assignment.orgType === "school") {
        const schoolId = ctx.db.normalizeId("schools", assignment.orgId);
        if (
          schoolId &&
          (await hasOrgRole(ctx, currentUser._id, schoolId, "school", [
            "admin",
          ]))
        ) {
          visible.push(assignment);
        }
        continue;
      }

      const campusId = ctx.db.normalizeId("campuses", assignment.orgId);
      const campus = campusId ? await ctx.db.get(campusId) : null;
      if (
        campusId &&
        campus &&
        (await canManageClasses(
          ctx,
          currentUser._id,
          campusId,
          campus.schoolId,
        ))
      ) {
        visible.push(assignment);
      }
    }
    return visible;
  },
});

export const getAssignmentInternal = internalQuery({
  args: {
    userId: v.id("users"),
    orgType: v.union(
      v.literal("system"),
      v.literal("school"),
      v.literal("campus"),
    ),
    orgId: v.optional(v.string()),
  },
  returns: v.union(roleAssignmentValidator, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("roleAssignments")
      .withIndex("by_user_org", (q) =>
        q
          .eq("userId", args.userId)
          .eq("orgId", args.orgId)
          .eq("orgType", args.orgType),
      )
      .first(),
});

export const removeRole = mutation({
  args: { assignmentId: v.id("roleAssignments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;
    const currentUser = await getCurrentUserOrThrow(ctx);
    await assertCanManageAssignment(
      ctx,
      currentUser._id,
      assignment.orgType,
      assignment.orgId,
      assignment.role,
    );

    await ctx.db.delete(args.assignmentId);

    // Sync to Clerk immediately
    const user = await ctx.db.get(assignment.userId);
    if (user && !user.clerkId.startsWith("temp_")) {
      await ctx.scheduler.runAfter(0, internal.roleAssignments.syncRolesToClerk, {
        userId: user._id,
        clerkId: user.clerkId,
      });
    }
    return null;
  },
});
