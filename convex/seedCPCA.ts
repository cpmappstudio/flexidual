import { action, internalMutation, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// 1. Create Infrastructure safely
export const createCPCAInfrastructure = internalMutation({
  handler: async (ctx) => {
    // Grab the first available user to act as the "system creator"
    const systemUser = await ctx.db.query("users").first();
    
    if (!systemUser) {
        throw new Error("No users found! Please log into the app at least once so your admin account is created before running this script.");
    }

    // Create School
    const schoolId = await ctx.db.insert("schools", {
      name: "Central Pointe Christian Academy-HN",
      slug: "cpca",
      isActive: true,
      createdAt: Date.now(),
      createdBy: systemUser._id,
    });

    // Create Main Campus
    const campusId = await ctx.db.insert("campuses", {
      schoolId: schoolId,
      name: "Main Campus",
      slug: "cpca-main",
      isActive: true,
      createdAt: Date.now(),
      createdBy: systemUser._id,
    });

    return { schoolId, campusId };
  },
});

// 1. Helper to safely delete lessons in batches of 500
export const deleteLessonsChunk = internalMutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const CHUNK_SIZE = 500;
    const curriculums = await ctx.db
      .query("curriculums")
      .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId))
      .collect();

    let count = 0;
    for (const curr of curriculums) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", curr._id))
        .take(CHUNK_SIZE - count);

      for (const lesson of lessons) {
        await ctx.db.delete(lesson._id);
        count++;
      }
      if (count >= CHUNK_SIZE) break;
    }
    return count;
  },
});

// 2. Helper to delete the remaining core data (safe for one transaction)
export const deleteCoreCampusData = internalMutation({
  args: {
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
  },
  handler: async (ctx, args): Promise<{ deletedUsers: number; deletedCurriculums: number, clerkIdsToDelete: string[] }> => {
    let deletedUsers = 0;
    let deletedCurriculums = 0;

    // Delete Curriculums
    if (args.schoolId) {
      const curriculums = await ctx.db
        .query("curriculums")
        .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId!))
        .collect();
      for (const curr of curriculums) {
        await ctx.db.delete(curr._id);
        deletedCurriculums++;
      }
    }

    // Delete Users & Roles
    const orgIdsToClear = [];
    if (args.schoolId) orgIdsToClear.push({ id: args.schoolId, type: "school" });
    if (args.campusId) orgIdsToClear.push({ id: args.campusId, type: "campus" });

    const userIdsToDelete = new Set<string>();
    for (const org of orgIdsToClear) {
      const assignments = await ctx.db
        .query("roleAssignments")
        .withIndex("by_org", (q) => q.eq("orgId", org.id).eq("orgType", org.type as any))
        .collect();
      for (const assignment of assignments) {
        userIdsToDelete.add(assignment.userId);
        await ctx.db.delete(assignment._id);
      }
    }

    const clerkIdsToDelete: string[] = [];

    for (const userId of userIdsToDelete) {
      // 1. Save the Clerk ID before deleting the user
      const user = await ctx.db.get(userId as Id<"users">);
      if (user && user.clerkId && !user.clerkId.startsWith("temp_")) {
        clerkIdsToDelete.push(user.clerkId);
      }

      // 2. Clear assignments
      const leftoverAssignments = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", userId as any))
        .collect();
      for (const assignment of leftoverAssignments) {
        await ctx.db.delete(assignment._id);
      }
      
      // 3. Delete user
      await ctx.db.delete(userId as any);
      deletedUsers++;
    }

    // Delete the Campus and School records themselves
    if (args.campusId) await ctx.db.delete(args.campusId);
    if (args.schoolId) await ctx.db.delete(args.schoolId);

    return { deletedUsers, deletedCurriculums, clerkIdsToDelete };
  },
});

// 3. The main Action that orchestrates the batching
export const wipeCampusData = internalAction({
  args: {
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
  },
  handler: async (ctx, args): Promise<{ totalLessonsDeleted: number; deletedUsers: number; deletedCurriculums: number }> => {
    let totalLessonsDeleted = 0;

    if (args.schoolId) {
      console.log("Starting lesson deletion in chunks...");
      let keepDeleting = true;
      while (keepDeleting) {
        const count = await ctx.runMutation(internal.seedCPCA.deleteLessonsChunk, {
          schoolId: args.schoolId,
        });
        totalLessonsDeleted += count;
        console.log(`Deleted ${totalLessonsDeleted} lessons so far...`);
        
        // If we deleted less than the chunk size, we've run out of lessons
        if (count === 0) keepDeleting = false; 
      }
    }

    console.log("Deleting curriculums, users, and campus data...");
    const coreResults = await ctx.runMutation(internal.seedCPCA.deleteCoreCampusData, args);

    // --- NEW: CLERK CLEANUP ---
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      console.warn("⚠️ CLERK_SECRET_KEY not set. Skipping Clerk user deletion.");
    } else if (coreResults.clerkIdsToDelete.length > 0) {
      console.log(`Deleting ${coreResults.clerkIdsToDelete.length} orphaned users from Clerk...`);
      for (const clerkId of coreResults.clerkIdsToDelete) {
        try {
          const response = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${clerkSecretKey}` },
          });
          if (!response.ok) {
            console.error(`Failed to delete Clerk user ${clerkId}: ${response.statusText}`);
          }
        } catch (error) {
          console.error(`Error deleting Clerk user ${clerkId}:`, error);
        }
      }
    }

    console.log("Wipe complete! Ready for a fresh migration.");
    return { 
      totalLessonsDeleted, 
      deletedUsers: coreResults.deletedUsers, 
      deletedCurriculums: coreResults.deletedCurriculums 
    };
  },
});

// 2. The Main Action to push users to Clerk and Convex
export const runMigration = action({
  args: {
    staff: v.array(v.any()),
    students: v.array(v.any())
  },
  handler: async (ctx, args): Promise<{ schoolId: string; campusId: string; staffResults: any; studentResults: any }> => {
    console.log("Starting CPCA Migration...");

    const { schoolId, campusId } = (await ctx.runMutation(internal.seedCPCA.createCPCAInfrastructure)) as { schoolId: string; campusId: string };
    
    const staffToCreate = args.staff;
    const studentsToCreate = args.students;

    console.log("Deploying Staff...");
    const staffResults: any = await ctx.runAction(api.users.createUsersWithClerk, {
      users: staffToCreate,
      orgType: "campus",
      orgId: campusId,
      sendInvitation: true 
    });
    console.log("Staff Results:", staffResults);

    console.log("Deploying Students...");
    const studentResults: any = await ctx.runAction(api.users.createUsersWithClerk, {
      users: studentsToCreate,
      orgType: "campus",
      orgId: campusId,
      sendInvitation: false 
    });
    console.log("Student Results:", studentResults);

    return { schoolId, campusId, staffResults, studentResults };
  }
});