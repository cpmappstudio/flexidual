import { v } from "convex/values";
import { mutation, query, internalMutation, QueryCtx, action } from "./_generated/server";
import { api, internal } from "./_generated/api";

// Type for Clerk webhook user data
type UserJSON = {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string;
  last_name?: string;
  image_url?: string;
  public_metadata?: Record<string, any>;
  [key: string]: any;
};

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get current user by Clerk ID
 */
export const getCurrentUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

/**
 * Get user by ID
 */
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Get user role by Clerk ID
 */
export const getUserRole = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    return user?.role || null;
  },
});

/**
 * Check if email already exists
 */
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

    if (user && (!args.excludeUserId || user._id !== args.excludeUserId)) {
      return true; // Email already exists
    }

    return false; // Email available
  },
});

/**
 * Get all users with optional filtering
 */
export const getUsers = query({
  args: {
    role: v.optional(v.union(
      v.literal("student"),
      v.literal("teacher"),
      v.literal("tutor"),
      v.literal("admin"),
      v.literal("superadmin")
    )),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let users = await ctx.db.query("users").collect();

    // Filter by role if provided
    if (args.role !== undefined) {
      users = users.filter(u => u.role === args.role);
    }

    // Filter by isActive if specified
    if (args.isActive !== undefined) {
      users = users.filter(u => u.isActive === args.isActive);
    }

    return users;
  },
});

/**
 * Get user avatar URL from storage
 */
export const getAvatarUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Get all teachers (for admin filtering)
 */
export const getTeachers = query({
  handler: async (ctx) => {
    const teachers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => 
        q.eq("role", "teacher").eq("isActive", true)
      )
      .collect();

    return teachers.map(t => ({
      _id: t._id,
      fullName: t.fullName,
      email: t.email,
      imageUrl: t.imageUrl,
    }));
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Generate upload URL for user avatar
 */
export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

/**
 * Update user profile (Convex only - no Clerk sync)
 */
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    updates: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
      role: v.optional(v.union(
        v.literal("student"),
        v.literal("teacher"),
        v.literal("tutor"),
        v.literal("admin"),
        v.literal("superadmin")
      )),
      isActive: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const updates: any = { 
      ...args.updates, 
      lastLoginAt: Date.now() 
    };

    // Update fullName if firstName or lastName changed
    if (args.updates.firstName || args.updates.lastName) {
      updates.fullName = `${args.updates.firstName || user.firstName} ${args.updates.lastName || user.lastName}`.trim();
    }

    // Convert null to undefined for Convex schema
    if (updates.avatarStorageId === null) {
      updates.avatarStorageId = undefined;
    }

    await ctx.db.patch(args.userId, updates);
  },
});

/**
 * Delete user avatar
 */
export const deleteUserAvatar = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Delete from storage if exists
    if (user.avatarStorageId) {
      try {
        await ctx.storage.delete(user.avatarStorageId);
      } catch (error) {
        console.warn("Avatar file not found, might already be deleted:", user.avatarStorageId);
      }
    }

    // Clear the field
    await ctx.db.patch(args.userId, {
      avatarStorageId: undefined,
      lastLoginAt: Date.now(),
    });
  },
});

/**
 * Create new user (manual creation - generates temp Clerk ID)
 */
export const createUser = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("student"),
      v.literal("teacher"),
      v.literal("tutor"),
      v.literal("admin"),
      v.literal("superadmin")
    ),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    // Generate temporary Clerk ID (will be replaced on first login)
    const tempClerkId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    const userId = await ctx.db.insert("users", {
      clerkId: tempClerkId,
      firstName: args.firstName,
      lastName: args.lastName,
      fullName: `${args.firstName} ${args.lastName}`.trim(),
      email: args.email,
      avatarStorageId: args.avatarStorageId,
      role: args.role,
      isActive: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Delete user
 */
export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Delete avatar from storage if exists
    if (user.avatarStorageId) {
      try {
        await ctx.storage.delete(user.avatarStorageId);
      } catch (error) {
        console.warn("Avatar file not found, might already be deleted:", user.avatarStorageId);
      }
    }

    // Delete the user
    await ctx.db.delete(args.userId);
  },
});

// ============================================================================
// CLERK WEBHOOK HANDLERS (Internal Mutations)
// ============================================================================

/**
 * Upsert user from Clerk webhook
 * Called automatically when Clerk creates/updates a user
 */
export const upsertFromClerk = internalMutation({
  args: { data: v.any() },
  handler: async (ctx, { data }: { data: UserJSON }) => {
    // Extract user data from Clerk
    const email = data.email_addresses?.[0]?.email_address || `user_${data.id}@temp.clerk`;
    const firstName = data.first_name || "";
    const lastName = data.last_name || "";
    
    // Extract role from public_metadata (default to "student")
    const publicMetadata = data.public_metadata || {};
    const role = publicMetadata.role || "student";

    // Check if user exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
      .first();

    const userData = {
      clerkId: data.id,
      email,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || email,
      imageUrl: data.image_url,
      role,
      isActive: true,
      lastLoginAt: Date.now(),
    };

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, userData);
    } else {
      // Create new user
      await ctx.db.insert("users", {
        ...userData,
        createdAt: Date.now(),
      });
    }
  },
});

/**
 * Delete user from Clerk webhook
 * Called automatically when Clerk deletes a user
 */
export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
      .first();

    if (user) {
      // Delete avatar from storage if exists
      if (user.avatarStorageId) {
        try {
          await ctx.storage.delete(user.avatarStorageId);
        } catch (error) {
          console.warn("Avatar file not found:", user.avatarStorageId);
        }
      }

      // Delete the user
      await ctx.db.delete(user._id);
    } else {
      console.warn(`Can't delete user, none found for Clerk ID: ${clerkUserId}`);
    }
  },
});

// ============================================================================
// CLERK INTEGRATION ACTIONS (Optional - for manual user creation in Clerk)
// ============================================================================

/**
 * Create user in both Clerk and Convex
 * Guarantees immediate consistency by syncing to DB before returning
 */
export const createUserWithClerk = action({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("student"),
      v.literal("teacher"),
      v.literal("tutor"),
      v.literal("admin"),
      v.literal("superadmin")
    ),
    avatarStorageId: v.optional(v.id("_storage")),
    sendInvitation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    try {
      // 1. Create user in Clerk
      const clerkResponse = await fetch("https://api.clerk.com/v1/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: [args.email],
          first_name: args.firstName,
          last_name: args.lastName,
          public_metadata: {
            role: args.role,
          },
          skip_password_checks: true,
          skip_password_requirement: true,
        }),
      });

      if (!clerkResponse.ok) {
        const errorData = await clerkResponse.json();
        throw new Error(`Clerk API error: ${errorData.errors?.[0]?.message || "Unknown error"}`);
      }

      const clerkUser = await clerkResponse.json();

      // 2. Upload avatar if provided (Optional polish)
      if (args.avatarStorageId) {
        const imageUrl = await ctx.storage.getUrl(args.avatarStorageId);
        if (imageUrl) {
          try {
            const imageResponse = await fetch(imageUrl);
            const imageBlob = await imageResponse.blob();
            
            const formData = new FormData();
            formData.append('file', imageBlob, 'avatar.png');

            await fetch(`https://api.clerk.com/v1/users/${clerkUser.id}/profile_image`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${clerkSecretKey}` },
              body: formData,
            });
          } catch (error) {
            console.error("Failed to sync avatar to Clerk:", error);
          }
        }
      }

      // 3. Immediate Sync to Convex
      await ctx.runMutation(internal.users.upsertFromClerk, {
        data: clerkUser
      });

      // 4. Send invitation (Optional)
      if (args.sendInvitation) {
        await fetch("https://api.clerk.com/v1/invitations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_address: args.email,
            public_metadata: { role: args.role },
            redirect_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-in`,
          }),
        });
      }

      return { 
        clerkId: clerkUser.id,
        invitationSent: args.sendInvitation || false
      };

    } catch (error) {
      console.error("Error creating user with Clerk:", error);
      throw error;
    }
  },
});

/**
 * Batch create users in Clerk and Convex
 * Returns a report of success/failures
 */
export const createUsersWithClerk = action({
  args: {
    users: v.array(v.object({
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      role: v.union(
        v.literal("student"),
        v.literal("teacher"),
        v.literal("tutor"),
        v.literal("admin"),
        v.literal("superadmin")
      ),
    })),
    sendInvitation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    const results = [];

    // Process sequentially to avoid rate limits, or Promise.all for speed if batches are small
    // Using sequential here for safety and clearer error reporting
    for (const user of args.users) {
      try {
        // 1. Create in Clerk
        const clerkResponse = await fetch("https://api.clerk.com/v1/users", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_address: [user.email],
            first_name: user.firstName,
            last_name: user.lastName,
            public_metadata: {
              role: user.role,
            },
            skip_password_checks: true,
            skip_password_requirement: true,
          }),
        });

        if (!clerkResponse.ok) {
          const errorData = await clerkResponse.json();
          throw new Error(errorData.errors?.[0]?.message || "Clerk error");
        }

        const clerkUser = await clerkResponse.json();

        // 2. Sync to Convex
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: clerkUser
        });

        // 3. Send Invite (Optional)
        if (args.sendInvitation) {
          await fetch("https://api.clerk.com/v1/invitations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${clerkSecretKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email_address: user.email,
              public_metadata: { role: user.role },
              redirect_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-in`,
            }),
          });
        }

        results.push({ email: user.email, status: "success" });

      } catch (error) {
        console.error(`Failed to create user ${user.email}:`, error);
        results.push({ 
          email: user.email, 
          status: "error", 
          reason: (error as Error).message 
        });
      }
    }

    return results;
  },
});

/**
 * Update user in both Clerk and Convex
 */
export const updateUserWithClerk = action({
  args: {
    userId: v.id("users"),
    updates: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
      role: v.optional(v.union(
        v.literal("student"), 
        v.literal("teacher"), 
        v.literal("tutor"),
        v.literal("admin"),
        v.literal("superadmin")
      )),
      isActive: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    const user = await ctx.runQuery(api.users.getUser, { userId: args.userId });
    if (!user) {
      throw new Error("User not found");
    }

    // Skip Clerk sync for temp users (just update DB)
    if (user.clerkId.startsWith("temp_")) {
      await ctx.runMutation(api.users.updateUser, { 
        userId: args.userId, 
        updates: args.updates 
      });
      return;
    }

    try {
      const clerkUpdates: any = {};
      
      if (args.updates.firstName) clerkUpdates.first_name = args.updates.firstName;
      if (args.updates.lastName) clerkUpdates.last_name = args.updates.lastName;
      
      if (args.updates.role) {
        clerkUpdates.public_metadata = { role: args.updates.role };
      }

      // Update Clerk if there are changes
      if (Object.keys(clerkUpdates).length > 0) {
        const response = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${clerkSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(clerkUpdates),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Clerk API error: ${errorData.errors?.[0]?.message}`);
        }
      }

      // Handle avatar updates
      if (args.updates.avatarStorageId !== undefined) {
        if (args.updates.avatarStorageId === null) {
          // Delete avatar from Clerk
          await fetch(`https://api.clerk.com/v1/users/${user.clerkId}/profile_image`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${clerkSecretKey}` },
          });
        } else {
          // Upload new avatar
          const imageUrl = await ctx.storage.getUrl(args.updates.avatarStorageId);
          if (imageUrl) {
            const imageResponse = await fetch(imageUrl);
            const imageBlob = await imageResponse.blob();
            
            const formData = new FormData();
            formData.append('file', imageBlob, 'avatar.png');

            await fetch(`https://api.clerk.com/v1/users/${user.clerkId}/profile_image`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${clerkSecretKey}` },
              body: formData,
            });
          }
        }
      }

      // Update Convex (This handles role, isActive, and names locally)
      await ctx.runMutation(api.users.updateUser, { 
        userId: args.userId, 
        updates: args.updates 
      });

    } catch (error) {
      console.error("Error updating user with Clerk:", error);
      throw error;
    }
  },
});

/**
 * Delete user from both Clerk and Convex
 */
export const deleteUserWithClerk = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    const user = await ctx.runQuery(api.users.getUser, { userId: args.userId });
    if (!user) {
      throw new Error("User not found");
    }

    // Skip Clerk deletion for temp users
    if (user.clerkId.startsWith("temp_")) {
      await ctx.runMutation(api.users.deleteUser, { userId: args.userId });
      return;
    }

    try {
      // Delete from Clerk (webhook will delete from Convex)
      const response = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Clerk API error: ${errorData.errors?.[0]?.message}`);
      }

    } catch (error) {
      console.error("Error deleting user with Clerk:", error);
      throw error;
    }
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current user or throw error
 */
export async function getCurrentUserOrThrow(ctx: QueryCtx) {
  const user = await getCurrentUserFromAuth(ctx);
  if (!user) {
    throw new Error("User not authenticated");
  }
  return user;
}

/**
 * Get current user from auth context
 */
export async function getCurrentUserFromAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
}