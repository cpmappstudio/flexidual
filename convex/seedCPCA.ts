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

// 2. Helper to safely delete lessons in batches of 500
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

// 3. Helper to delete the remaining core data (safe for one transaction)
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
      const user = await ctx.db.get(userId as Id<"users">);
      if (user && user.clerkId && !user.clerkId.startsWith("temp_")) {
        clerkIdsToDelete.push(user.clerkId);
      }

      const leftoverAssignments = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", userId as any))
        .collect();
      for (const assignment of leftoverAssignments) {
        await ctx.db.delete(assignment._id);
      }
      
      await ctx.db.delete(userId as any);
      deletedUsers++;
    }

    if (args.campusId) await ctx.db.delete(args.campusId);
    if (args.schoolId) await ctx.db.delete(args.schoolId);

    return { deletedUsers, deletedCurriculums, clerkIdsToDelete };
  },
});

// 4. The main Action that orchestrates the batching
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
        if (count === 0) keepDeleting = false; 
      }
    }

    console.log("Deleting curriculums, users, and campus data...");
    const coreResults = await ctx.runMutation(internal.seedCPCA.deleteCoreCampusData, args);

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

// 5. DYNAMIC SCHEDULE GENERATOR
export const generateDynamicClassesAndSchedules = internalMutation({
  args: { 
    schoolId: v.id("schools"), 
    campusId: v.id("campuses"),
    scheduleConfig: v.array(v.any()) // Accepts the JSON payload
  },
  handler: async (ctx, args) => {
    const allUsers = await ctx.db.query("users").collect();
    
    // Get 7th Grade Students
    const studentIds = allUsers.filter(u => u.grade === "07").map(u => u._id);
    if (studentIds.length === 0) {
      console.log("⚠️ No 7th grade students found, skipping schedules.");
      return;
    }

    // BASE DATE: Monday, March 23, 2026 locking to Honduras Time (UTC-6)
    const baseDate = new Date("2026-03-23T00:00:00-06:00"); 
    const baseMs = baseDate.getTime();
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;

    let schedulesCreated = 0;

    for (const classConfig of args.scheduleConfig) {
      let teacherId = undefined;
      
      // Look up the teacher by last name if it's a standard class
      if (classConfig.classType === "standard" && classConfig.teacherSearchTerm) {
        const teacher = allUsers.find(u => 
          u.lastName?.toLowerCase().includes(classConfig.teacherSearchTerm.toLowerCase()) || 
          u.fullName?.toLowerCase().includes(classConfig.teacherSearchTerm.toLowerCase())
        );
        if (teacher) teacherId = teacher._id;
      }

      // Create Curriculum
      const currId = await ctx.db.insert("curriculums", { 
        title: classConfig.curriculumTitle, 
        code: classConfig.code, 
        isActive: true, 
        createdAt: Date.now(), 
        createdBy: teacherId || studentIds[0], // Fallback if abeka
        schoolId: args.schoolId 
      });

      // Create Class
      const classId = await ctx.db.insert("classes", { 
        name: classConfig.name, 
        curriculumId: currId, 
        campusId: args.campusId, 
        teacherId: teacherId, // Will be undefined for abeka
        students: studentIds, 
        classType: classConfig.classType, 
        isActive: true, 
        createdAt: Date.now(), 
        createdBy: teacherId || studentIds[0] 
      });

      // Generate 20 weeks of schedules
      for (let w = 0; w < 20; w++) {
        const weekBase = baseMs + (w * WEEK);
        
        for (const sched of classConfig.schedules) {
          // dayOfWeek: 1 = Monday. We subtract 1 to get the offset from our Monday baseDate.
          const dayBase = weekBase + ((sched.dayOfWeek - 1) * DAY);
          
          // Parse "HH:MM" strings
          const [startH, startM] = sched.start.split(":").map(Number);
          const [endH, endM] = sched.end.split(":").map(Number);
          
          const startMs = dayBase + (startH * 60 * 60 * 1000) + (startM * 60 * 1000);
          const endMs = dayBase + (endH * 60 * 60 * 1000) + (endM * 60 * 1000);

          await ctx.db.insert("classSchedule", {
            classId: classId,
            title: sched.title,
            scheduledStart: startMs,
            scheduledEnd: endMs,
            sessionType: classConfig.classType === "abeka" ? "abeka" : "live",
            roomName: `class-${classId}-${startMs}`,
            isLive: false,
            isRecurring: false, 
            status: "scheduled",
            createdAt: Date.now(),
            createdBy: teacherId || studentIds[0],
          });
          schedulesCreated++;
        }
      }
    }
    console.log(`✅ Successfully generated ${schedulesCreated} JSON-driven schedules!`);
  }
});

// 6. The Main Action
export const runMigration = action({
  args: {
    staff: v.array(v.any()),
    students: v.array(v.any()),
    scheduleConfig: v.optional(v.array(v.any())), // Receive the JSON config
  },
  handler: async (ctx, args): Promise<{ schoolId: string; campusId: string; staffResults: any; studentResults: any }> => {
    console.log("Starting CPCA Migration...");

    const { schoolId, campusId } = (await ctx.runMutation(internal.seedCPCA.createCPCAInfrastructure)) as { schoolId: string; campusId: string };
    
    console.log("Deploying Staff...");
    const staffResults: any = await ctx.runAction(api.users.createUsersWithClerk, {
      users: args.staff,
      orgType: "campus",
      orgId: campusId,
      sendInvitation: true 
    });

    console.log("Deploying Students...");
    const studentResults: any = await ctx.runAction(api.users.createUsersWithClerk, {
      users: args.students,
      orgType: "campus",
      orgId: campusId,
      sendInvitation: false 
    });

    if (args.scheduleConfig && args.scheduleConfig.length > 0) {
      console.log("Generating Dynamic Classes and Schedules from JSON...");
      await ctx.runMutation(internal.seedCPCA.generateDynamicClassesAndSchedules, {
        schoolId: schoolId as Id<"schools">,
        campusId: campusId as Id<"campuses">,
        scheduleConfig: args.scheduleConfig
      });
    }

    return { schoolId, campusId, staffResults, studentResults };
  }
});