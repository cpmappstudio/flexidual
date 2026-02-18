import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const run = mutation({
  args: { 
    clearExisting: v.optional(v.boolean()) 
  },
  handler: async (ctx, args) => {
    // 1. CLEAR EXISTING DATA (Optional)
    if (args.clearExisting) {
      const allTables = ["classSchedule", "classes", "lessons", "curriculums", "users", "class_sessions"];
      for (const table of allTables) {
        const docs = await ctx.db.query(table as any).collect();
        for (const doc of docs) {
          await ctx.db.delete(doc._id);
        }
      }
    }

    // 2. CREATE USERS
    const teacherId = await ctx.db.insert("users", {
      clerkId: "user_teacher_frizzle", 
      email: "frizzle@school.edu",
      firstName: "Valerie",
      lastName: "Frizzle",
      fullName: "Valerie Frizzle",
      role: "teacher",
      isActive: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    // Create multiple students for realistic classroom
    const studentIds = await Promise.all([
      ctx.db.insert("users", {
        clerkId: "user_student_arnold",
        email: "arnold@school.edu",
        firstName: "Arnold",
        lastName: "Perlstein",
        fullName: "Arnold Perlstein",
        role: "student",
        isActive: true,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }),
      ctx.db.insert("users", {
        clerkId: "user_student_carlos",
        email: "carlos@school.edu",
        firstName: "Carlos",
        lastName: "Ramon",
        fullName: "Carlos Ramon",
        role: "student",
        isActive: true,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }),
      ctx.db.insert("users", {
        clerkId: "user_student_keesha",
        email: "keesha@school.edu",
        firstName: "Keesha",
        lastName: "Franklin",
        fullName: "Keesha Franklin",
        role: "student",
        isActive: true,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }),
    ]);

    // Admin user for testing admin features
    const adminId = await ctx.db.insert("users", {
      clerkId: "user_admin_ruhle",
      email: "ruhle@school.edu",
      firstName: "Principal",
      lastName: "Ruhle",
      fullName: "Principal Ruhle",
      role: "admin",
      isActive: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    // 3. CREATE CURRICULUM
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Magic School Bus Science",
      description: "Field trips into the unknown!",
      code: "SCI-101",
      color: "#8b5cf6", // Violet
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });

    // 4. CREATE LESSONS (Add a third for variety)
    const lesson1Id = await ctx.db.insert("lessons", {
      curriculumId,
      title: "The Solar System",
      description: "Explore the planets and the sun.",
      content: "<h1>Space is big!</h1><p>You just won't believe how vastly, hugely, mind-bogglingly big it is.</p>",
      order: 1,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });

    const lesson2Id = await ctx.db.insert("lessons", {
      curriculumId,
      title: "Inside the Human Body",
      description: "A journey through the digestive system.",
      content: "<h1>Digestion</h1><p>It gets messy in here.</p>",
      order: 2,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });

    const lesson3Id = await ctx.db.insert("lessons", {
      curriculumId,
      title: "The Water Cycle",
      description: "Follow water from ocean to clouds to rain.",
      content: "<h1>Water never disappears!</h1><p>It just keeps cycling around.</p>",
      order: 3,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });

    // 5. CREATE CLASS (GROUP)
    const classId = await ctx.db.insert("classes", {
      name: "Science 101 - Fall 2024",
      curriculumId,
      teacherId,
      students: studentIds, // Enroll all students
      academicYear: "2024-2025",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
      startDate: Date.now() - (30 * 24 * 60 * 60 * 1000), // Started 30 days ago
      endDate: Date.now() + (60 * 24 * 60 * 60 * 1000), // Ends in 60 days
    });

    // 6. SCHEDULE LESSONS (Create realistic weekly schedule)
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Lesson 1: Active NOW (can join immediately)
    const schedule1Id = await ctx.db.insert("classSchedule", {
      classId,
      lessonIds: [lesson1Id],
      scheduledStart: now - (10 * 60 * 1000), // Started 10 min ago
      scheduledEnd: now + (50 * 60 * 1000), // Ends in 50 min
      roomName: `class-${classId}-lesson-${lesson1Id}-${now}`,
      status: "active",
      isLive: true,
      createdAt: now,
      createdBy: teacherId,
    });

    // Lesson 2: Scheduled for TOMORROW at 10 AM
    const tomorrow10AM = new Date();
    tomorrow10AM.setDate(tomorrow10AM.getDate() + 1);
    tomorrow10AM.setHours(10, 0, 0, 0);
    
    await ctx.db.insert("classSchedule", {
      classId,
      lessonIds: [lesson2Id],
      scheduledStart: tomorrow10AM.getTime(),
      scheduledEnd: tomorrow10AM.getTime() + oneHour,
      roomName: `class-${classId}-lesson-${lesson2Id}-${tomorrow10AM.getTime()}`,
      status: "scheduled",
      isLive: false,
      createdAt: now,
      createdBy: teacherId,
    });

    // Lesson 3: Scheduled for NEXT WEEK
    const nextWeek = now + (7 * 24 * 60 * 60 * 1000);
    
    await ctx.db.insert("classSchedule", {
      classId,
      lessonIds: [lesson3Id],
      scheduledStart: nextWeek,
      scheduledEnd: nextWeek + oneHour,
      roomName: `class-${classId}-lesson-${lesson3Id}-${nextWeek}`,
      status: "scheduled",
      isLive: false,
      createdAt: now,
      createdBy: teacherId,
    });

    // BONUS: Add a completed session (yesterday)
    const yesterday = now - (24 * 60 * 60 * 1000);
    await ctx.db.insert("classSchedule", {
      classId,
      lessonIds: [lesson1Id], // Reuse lesson 1
      scheduledStart: yesterday,
      scheduledEnd: yesterday + oneHour,
      roomName: `class-${classId}-lesson-${lesson1Id}-${yesterday}`,
      status: "completed",
      isLive: false,
      completedAt: yesterday + oneHour,
      createdAt: yesterday - (2 * 24 * 60 * 60 * 1000), // Scheduled 2 days before
      createdBy: teacherId,
    });

    // 7. CREATE SAMPLE ATTENDANCE DATA (for completed session)
    for (const studentId of studentIds) {
      await ctx.db.insert("class_sessions", {
        scheduleId: schedule1Id,
        studentId,
        joinedAt: yesterday + (5 * 60 * 1000), // Joined 5 min after start
        leftAt: yesterday + (55 * 60 * 1000), // Left 5 min before end
        durationSeconds: 50 * 60, // 50 minutes
        roomName: `class-${classId}-lesson-${lesson1Id}-${yesterday}`,
        sessionDate: new Date(yesterday).toISOString().split('T')[0],
      });
    }

    return {
      message: "Seed complete!",
      stats: {
        users: {
          teachers: 1,
          students: studentIds.length,
          admins: 1,
        },
        curriculum: 1,
        lessons: 3,
        classes: 1,
        schedules: {
          active: 1,
          scheduled: 2,
          completed: 1,
        },
        attendance: studentIds.length,
      }
    };
  },
});