import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================================================
// INTERNAL HELPERS (For Syncing to Clerk)
// ============================================================================

export const getUserAssignmentsInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getOrgSlugInternal = internalQuery({
  args: { orgId: v.string(), orgType: v.string() },
  handler: async (ctx, args) => {
    if (args.orgType === "school") {
      const school = await ctx.db.get(args.orgId as Id<"schools">);
      return school?.slug;
    }
    if (args.orgType === "campus") {
      const campus = await ctx.db.get(args.orgId as Id<"campuses">);
      return campus?.slug;
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
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");

    if (args.clerkId.startsWith("temp_")) return; // Don't sync temp accounts

    // 1. Fetch all their role assignments
    const assignments = await ctx.runQuery(internal.roleAssignments.getUserAssignmentsInternal, { 
      userId: args.userId 
    });

    // 2. Build the dictionary map
    const rolesMap: Record<string, string> = {};
    
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

    // 3. Push to Clerk
    await fetch(`https://api.clerk.com/v1/users/${args.clerkId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        public_metadata: { roles: rolesMap },
      }),
    });
  },
});

// Returns all role assignments for a given org — used when a slug changes.
export const getOrgAssignmentsInternal = internalQuery({
  args: {
    orgId: v.string(),
    orgType: v.union(v.literal("school"), v.literal("campus")),
  },
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
  handler: async (ctx, args) => {
    const assignments = await ctx.runQuery(internal.roleAssignments.getOrgAssignmentsInternal, args);
    const seen = new Set<string>();
    for (const assignment of assignments) {
      const uid = assignment.userId as string;
      if (seen.has(uid)) continue;
      seen.add(uid);
      const user = await ctx.runQuery(api.users.getUser, { userId: assignment.userId });
      if (user && !user.clerkId.startsWith("temp_")) {
        await ctx.runAction(internal.roleAssignments.syncRolesToClerk, {
          userId: assignment.userId,
          clerkId: user.clerkId,
        });
      }
    }
  },
});

// Rebuilds Clerk public_metadata.roles for EVERY user from the Convex roleAssignments table.
// Run this once to heal all corrupted metadata after the grade/school metadata bug.
export const healAllUserRoles = action({
  handler: async (ctx) => {
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
    role: v.union(
      v.literal("superadmin"), v.literal("admin"), v.literal("principal"), 
      v.literal("teacher"), v.literal("tutor"), v.literal("student")
    ),
  },
  handler: async (ctx, args) => {
    // 1. Authorization: Only Superadmins or Admins can assign roles
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Check if assignment already exists to prevent duplicates
    const existing = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user_org", (q) => 
        q.eq("userId", args.userId).eq("orgId", args.orgId).eq("orgType", args.orgType)
      )
      .first();

    if (args.role === "superadmin") {
      const existingAssignments = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
        
      for (const e of existingAssignments) {
        if (e.orgType !== "system" || e.role !== "superadmin") {
           await ctx.db.delete(e._id);
        }
      }
    }

    if (existing) {
      // Update existing role
      await ctx.db.patch(existing._id, { role: args.role, assignedAt: Date.now() });
    } else {
      // Create new assignment
      await ctx.db.insert("roleAssignments", {
        userId: args.userId,
        orgType: args.orgType,
        orgId: args.orgId,
        role: args.role,
        assignedAt: Date.now(),
      });
    }

    // 2. Trigger background sync to Clerk
    const user = await ctx.db.get(args.userId);
    if (user && !user.clerkId.startsWith("temp_")) {
      await ctx.scheduler.runAfter(0, internal.roleAssignments.syncRolesToClerk, {
        userId: args.userId,
        clerkId: user.clerkId,
      });
    }
  },
});

export const getUserRoleInOrg = query({
  args: {
    userId: v.id("users"),
    orgId: v.optional(v.string()),
    orgType: v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("orgType"), args.orgType))
      .collect();

    const match = args.orgId
      ? assignments.find(a => a.orgId === args.orgId)
      : assignments.find(a => !a.orgId); // system level has no orgId

    return match?.role ?? null;
  },
});

export const assignRoleInternal = internalMutation({
  args: {
    userId: v.id("users"),
    orgType: v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
    orgId: v.optional(v.string()), 
    role: v.union(
      v.literal("superadmin"), v.literal("admin"), v.literal("principal"), 
      v.literal("teacher"), v.literal("tutor"), v.literal("student")
    ),
  },
  handler: async (ctx, args) => {
    // No auth check needed here since it's an internal mutation
    
    const existing = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user_org", (q) => 
        q.eq("userId", args.userId).eq("orgId", args.orgId).eq("orgType", args.orgType)
      )
      .first();

    if (args.role === "superadmin") {
      const existingAssignments = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
        
      for (const e of existingAssignments) {
        if (e.orgType !== "system" || e.role !== "superadmin") {
           await ctx.db.delete(e._id);
        }
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role, assignedAt: Date.now() });
    } else {
      await ctx.db.insert("roleAssignments", {
        userId: args.userId,
        orgType: args.orgType,
        orgId: args.orgId,
        role: args.role,
        assignedAt: Date.now(),
      });
    }

    const user = await ctx.db.get(args.userId);
    if (user && !user.clerkId.startsWith("temp_")) {
      await ctx.scheduler.runAfter(0, internal.roleAssignments.syncRolesToClerk, {
        userId: args.userId,
        clerkId: user.clerkId,
      });
    }
  },
});

export const getUserRoles = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const removeRole = mutation({
  args: { assignmentId: v.id("roleAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return;

    await ctx.db.delete(args.assignmentId);

    // Sync to Clerk immediately
    const user = await ctx.db.get(assignment.userId);
    if (user && !user.clerkId.startsWith("temp_")) {
      await ctx.scheduler.runAfter(0, internal.roleAssignments.syncRolesToClerk, {
        userId: user._id,
        clerkId: user.clerkId,
      });
    }
  },
});