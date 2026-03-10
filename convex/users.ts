import { v } from "convex/values";
import { mutation, query, internalMutation, QueryCtx, action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { GRADE_VALUES } from "../lib/types/academic";
import { ConvexError } from "convex/values";

type UserJSON = {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string;
  last_name?: string;
  username?: string;
  image_url?: string;
  public_metadata?: Record<string, any>;
  [key: string]: any;
};

// ============================================================================
// QUERIES
// ============================================================================

export const getCurrentUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const checkEmailExists = query({
  args: {
    email: v.string(),
    excludeUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    return !!(user && (!args.excludeUserId || user._id !== args.excludeUserId));
  },
});

export const getUsers = query({
  args: {
    role: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    orgType: v.optional(v.union(v.literal("system"), v.literal("school"), v.literal("campus"))),
    orgId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let assignmentQuery = ctx.db.query("roleAssignments");

    if (args.orgType && args.orgType !== "system") {
      assignmentQuery = assignmentQuery.filter(q => 
        q.and(
          q.eq(q.field("orgId"), args.orgId),
          q.eq(q.field("orgType"), args.orgType)
        )
      );
    } 

    if (args.role) {
      assignmentQuery = assignmentQuery.filter(q => q.eq(q.field("role"), args.role));
    }

    const assignments = await assignmentQuery.collect();
    const validUserIds = new Set(assignments.map(a => a.userId));

    let users = await ctx.db.query("users").collect();

    if (args.isActive !== undefined) {
      users = users.filter(u => u.isActive === args.isActive);
    }

    // If we specified an orgType (not system) OR a role filter, strictly return only valid users
    if ((args.orgType && args.orgType !== "system") || args.role) {
      return users
        .filter(u => validUserIds.has(u._id))
        .map(u => {
           const specificAssignment = assignments.find(a => a.userId === u._id);
           return { 
             ...u, 
             role: specificAssignment?.role,
             orgId: specificAssignment?.orgId,
             orgType: specificAssignment?.orgType
           };
        });
    }

    // Global fallback (System Dashboard, All Users tab)
    return users.map(u => {
        const userAssignments = assignments.filter(a => a.userId === u._id);
        // Prefer their system assignment if they have one, else pick their first org assignment
        const bestAssignment = userAssignments.find(a => a.orgType === "system") || userAssignments[0];
        return { 
            ...u, 
            role: bestAssignment?.role,
            orgId: bestAssignment?.orgId,
            orgType: bestAssignment?.orgType
        };
    });
  },
});

export const getAvatarUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getTeachers = query({
  handler: async (ctx) => {
    // 1. Find all users who have a "teacher" or "tutor" role assignment
    const assignments = await ctx.db.query("roleAssignments").collect();
    const teacherUserIds = new Set(
      assignments.filter(a => a.role === "teacher" || a.role === "tutor").map(a => a.userId)
    );

    // 2. Fetch their user profiles
    const teachers = [];
    for (const id of teacherUserIds) {
      const t = await ctx.db.get(id);
      if (t && t.isActive) {
        teachers.push({
          _id: t._id,
          fullName: t.fullName,
          email: t.email,
          imageUrl: t.imageUrl,
        });
      }
    }
    return teachers;
  },
});

// ============================================================================
// MUTATIONS (Convex Only)
// ============================================================================

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    updates: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      externalPassword: v.optional(v.string()),
      avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
      grade: v.optional(v.string()),
      school: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    if (args.updates.grade && !(GRADE_VALUES as readonly string[]).includes(args.updates.grade)) {
      throw new ConvexError({ code: "INVALID_GRADE", grades: args.updates.grade });
    }

    const updates: any = { ...args.updates, lastLoginAt: Date.now() };

    if (args.updates.firstName || args.updates.lastName) {
      updates.fullName = `${args.updates.firstName || user.firstName} ${args.updates.lastName || user.lastName}`.trim();
    }

    if (updates.avatarStorageId === null) updates.avatarStorageId = undefined;

    await ctx.db.patch(args.userId, updates);
  },
});

export const deleteUserAvatar = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    if (user.avatarStorageId) {
      try { await ctx.storage.delete(user.avatarStorageId); } catch (e) {}
    }

    await ctx.db.patch(args.userId, { avatarStorageId: undefined, lastLoginAt: Date.now() });
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    if (user.avatarStorageId) {
      try { await ctx.storage.delete(user.avatarStorageId); } catch (e) {}
    }
    
    // Cleanup role assignments
    const assignments = await ctx.db.query("roleAssignments").withIndex("by_user", q => q.eq("userId", args.userId)).collect();
    for (const a of assignments) {
       await ctx.db.delete(a._id);
    }

    await ctx.db.delete(args.userId);
  },
});

// ============================================================================
// CLERK WEBHOOK HANDLERS
// ============================================================================

export const upsertFromClerk = internalMutation({
  args: { data: v.any() },
  handler: async (ctx, { data }: { data: UserJSON }) => {
    const email = data.email_addresses?.[0]?.email_address;
    const username = data.username ?? undefined;
    const firstName = data.first_name || "";
    const lastName = data.last_name || "";
    
    const publicMetadata = data.public_metadata || {};
    const grade = publicMetadata.grade;
    const school = publicMetadata.school;

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
      .first();

    const userData = {
      clerkId: data.id,
      email: email || "",
      username: username,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || email || username || "Unknown User",
      imageUrl: data.image_url ?? undefined,
      grade,
      school,
      isActive: true,
      lastLoginAt: Date.now(),
    };

    if (existingUser) {
      await ctx.db.patch(existingUser._id, userData);
    } else {
      await ctx.db.insert("users", { ...userData, createdAt: Date.now() });
    }
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId)).first();

    if (user) {
      if (user.avatarStorageId) {
        try { await ctx.storage.delete(user.avatarStorageId); } catch (e) {}
      }
      
      const assignments = await ctx.db.query("roleAssignments").withIndex("by_user", q => q.eq("userId", user._id)).collect();
      for (const a of assignments) await ctx.db.delete(a._id);

      await ctx.db.delete(user._id);
    }
  },
});

// ============================================================================
// CLERK INTEGRATION ACTIONS
// ============================================================================

export const createUsersWithClerk = action({
  args: {
    users: v.array(v.object({
      firstName: v.string(),
      lastName: v.string(),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      password: v.optional(v.string()),
      role: v.string(),
      grade: v.optional(v.string()),
      school: v.optional(v.string()),
    })),
    orgType: v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
    orgId: v.optional(v.string()),
    sendInvitation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");

    const results = [];

    for (const user of args.users) {
      try {
        if (user.grade && !(GRADE_VALUES as readonly string[]).includes(user.grade)) {
           results.push({ identifier: user.email || user.username, status: "error", reason: `Invalid grade: ${user.grade}` });
           continue;
        }

        // 1. Create in Clerk
        const clerkPayload: any = {
            first_name: user.firstName,
            last_name: user.lastName,
            public_metadata: { grade: user.grade, school: user.school },
            skip_password_checks: true,
            skip_password_requirement: true,
        };

        if (user.email) clerkPayload.email_address = [user.email];
        if (user.username) clerkPayload.username = user.username;
        if (user.password) clerkPayload.password = user.password; // Sets their Flexidual password!

        const clerkResponse = await fetch("https://api.clerk.com/v1/users", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(clerkPayload),
        });

        if (!clerkResponse.ok) {
          const errorData = await clerkResponse.json();
          throw new Error(errorData.errors?.[0]?.message || "Clerk error");
        }

        const clerkUser = await clerkResponse.json();

        // 2. Sync Identity to Convex
        await ctx.runMutation(internal.users.upsertFromClerk, { data: clerkUser });

        // 3. Retrieve the newly created Convex User ID
        const newConvexUser = await ctx.runQuery(api.users.getCurrentUser, { clerkId: clerkUser.id });
        if (!newConvexUser) throw new Error("Failed to sync identity to database");

        // 4. Create the Role Assignment (This triggers the syncRolesToClerk background job automatically!)
        await ctx.runMutation(internal.roleAssignments.assignRoleInternal, {
          userId: newConvexUser._id,
          orgType: args.orgType,
          orgId: args.orgId,
          role: user.role as any,
        });

        if (user.password || user.username) {
            await ctx.runMutation(api.users.updateUser, {
                userId: newConvexUser._id,
                updates: {
                    username: user.username,
                    externalPassword: user.password 
                }
            });
        }

        // 5. Send Invite
        if (args.sendInvitation && user.email) {
          await fetch("https://api.clerk.com/v1/invitations", {
            method: "POST",
            headers: { Authorization: `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              email_address: user.email,
              redirect_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-in`,
            }),
          });
        }

        results.push({ email: user.email, status: "success" });
      } catch (error) {
        results.push({ identifier: user.email || user.username, status: "error", reason: (error as Error).message });
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
      role: v.optional(v.string()),
      grade: v.optional(v.string()),
      school: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
    }),
    // Context required to update the correct role assignment
    orgType: v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
    orgId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");

    const user = await ctx.runQuery(api.users.getUser, { userId: args.userId });
    if (!user) throw new Error("User not found");

    if (args.updates.grade && !(GRADE_VALUES as readonly string[]).includes(args.updates.grade)) {
      throw new ConvexError({ code: "INVALID_GRADE", grades: args.updates.grade });
    }

    // 1. Update Core Identity in Convex
    await ctx.runMutation(api.users.updateUser, { 
      userId: args.userId, 
      updates: args.updates 
    });

    // 2. Update Role Assignment if role changed
    if (args.updates.role) {
      await ctx.runMutation(internal.roleAssignments.assignRoleInternal, {
        userId: args.userId,
        orgType: args.orgType,
        orgId: args.orgId,
        role: args.updates.role as any,
      });
    }

    // 3. Update basic details in Clerk (if not a temp user)
    if (!user.clerkId.startsWith("temp_")) {
      const clerkUpdates: any = {};
      if (args.updates.firstName) clerkUpdates.first_name = args.updates.firstName;
      if (args.updates.lastName) clerkUpdates.last_name = args.updates.lastName;
      if (args.updates.username) clerkUpdates.username = args.updates.username;
      if (args.updates.password) {
        clerkUpdates.password = args.updates.password;
        clerkUpdates.skip_password_checks = true;
      }
      
      const metadataUpdates: any = {};
      if (args.updates.grade !== undefined) metadataUpdates.grade = args.updates.grade;
      if (args.updates.school !== undefined) metadataUpdates.school = args.updates.school;

      if (Object.keys(metadataUpdates).length > 0) clerkUpdates.public_metadata = metadataUpdates;

      if (Object.keys(clerkUpdates).length > 0) {
        await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${clerkSecretKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(clerkUpdates),
        });
      }
    }
  },
});

export const deleteUserWithClerk = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY not configured");

    const user = await ctx.runQuery(api.users.getUser, { userId: args.userId });
    if (!user) throw new Error("User not found");

    if (user.clerkId.startsWith("temp_")) {
      await ctx.runMutation(api.users.deleteUser, { userId: args.userId });
      return;
    }

    const response = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${clerkSecretKey}` },
    });

    if (!response.ok) throw new Error("Clerk API error");
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
  
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
}

export const getAllUsersInternal = internalQuery({ handler: async (ctx) => await ctx.db.query("users").collect() })