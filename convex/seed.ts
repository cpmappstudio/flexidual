import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const run = mutation({
  args: { 
    clearExisting: v.optional(v.boolean()) 
  },
  handler: async (ctx, args) => {
    // 1. CLEAR EXISTING DATA (Optional)
    if (args.clearExisting) {
      const allTables = [
        "classSchedule", "classes", "lessons", "curriculums", 
        "users", "class_sessions", "schools", "campuses", "roleAssignments"
      ];
      for (const table of allTables) {
        const docs = await ctx.db.query(table as any).collect();
        for (const doc of docs) {
          await ctx.db.delete(doc._id);
        }
      }
    }

    // 2. CREATE USERS (Identity only)
    const teacherId = await ctx.db.insert("users", {
      clerkId: "user_teacher_frizzle", 
      email: "frizzle@school.edu",
      firstName: "Valerie",
      lastName: "Frizzle",
      fullName: "Valerie Frizzle",
      isActive: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    const studentIds = await Promise.all([
      ctx.db.insert("users", {
        clerkId: "user_student_arnold",
        email: "arnold@school.edu",
        firstName: "Arnold",
        lastName: "Perlstein",
        fullName: "Arnold Perlstein",
        isActive: true,
        createdAt: Date.now(),
      }),
      ctx.db.insert("users", {
        clerkId: "user_student_carlos",
        email: "carlos@school.edu",
        firstName: "Carlos",
        lastName: "Ramon",
        fullName: "Carlos Ramon",
        isActive: true,
        createdAt: Date.now(),
      }),
      ctx.db.insert("users", {
        clerkId: "user_student_keesha",
        email: "keesha@school.edu",
        firstName: "Keesha",
        lastName: "Franklin",
        fullName: "Keesha Franklin",
        isActive: true,
        createdAt: Date.now(),
      }),
    ]);

    const adminId = await ctx.db.insert("users", {
      clerkId: "user_admin_ruhle",
      email: "ruhle@school.edu",
      firstName: "Principal",
      lastName: "Ruhle",
      fullName: "Principal Ruhle",
      isActive: true,
      createdAt: Date.now(),
    });

    // 3. CREATE MULTI-TENANT HIERARCHY
    const schoolId = await ctx.db.insert("schools", {
      name: "Magic School District",
      slug: "magic-school",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });

    const campusId = await ctx.db.insert("campuses", {
      schoolId: schoolId,
      name: "Main Campus",
      slug: "main-campus",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });

    // 4. ASSIGN ROLES
    await ctx.db.insert("roleAssignments", { userId: adminId, orgType: "school", orgId: schoolId, role: "admin", assignedAt: Date.now() });
    await ctx.db.insert("roleAssignments", { userId: teacherId, orgType: "campus", orgId: campusId, role: "teacher", assignedAt: Date.now() });
    for (const studentId of studentIds) {
      await ctx.db.insert("roleAssignments", { userId: studentId, orgType: "campus", orgId: campusId, role: "student", assignedAt: Date.now() });
    }

    // 5. CREATE CURRICULUM (Attached to School)
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Magic School Bus Science",
      description: "Field trips into the unknown!",
      code: "SCI-101",
      color: "#8b5cf6",
      schoolId: schoolId,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });

    // 6. CREATE LESSONS
    const lesson1Id = await ctx.db.insert("lessons", {
      curriculumId, title: "The Solar System", description: "Explore the planets.", content: "Space is big!", order: 1, isActive: true, createdAt: Date.now(), createdBy: teacherId,
    });
    const lesson2Id = await ctx.db.insert("lessons", {
      curriculumId, title: "Inside the Human Body", description: "A journey through the digestive system.", content: "Digestion", order: 2, isActive: true, createdAt: Date.now(), createdBy: teacherId,
    });
    const lesson3Id = await ctx.db.insert("lessons", {
      curriculumId, title: "The Water Cycle", description: "Ocean to clouds to rain.", content: "Water cycles", order: 3, isActive: true, createdAt: Date.now(), createdBy: teacherId,
    });

    // 7. CREATE CLASS (Attached to Campus)
    const classId = await ctx.db.insert("classes", {
      name: "Science 101 - Fall 2024",
      curriculumId,
      campusId: campusId,
      teacherId,
      students: studentIds,
      academicYear: "2024-2025",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
      startDate: Date.now() - (30 * 24 * 60 * 60 * 1000),
      endDate: Date.now() + (60 * 24 * 60 * 60 * 1000),
    });

    // 8. SCHEDULE LESSONS
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    const schedule1Id = await ctx.db.insert("classSchedule", {
      classId, lessonIds: [lesson1Id], scheduledStart: now - (10 * 60 * 1000), scheduledEnd: now + (50 * 60 * 1000), roomName: `class-${classId}-lesson-${lesson1Id}-${now}`, status: "active", isLive: true, createdAt: now, createdBy: teacherId,
    });

    const tomorrow10AM = new Date(); tomorrow10AM.setDate(tomorrow10AM.getDate() + 1); tomorrow10AM.setHours(10, 0, 0, 0);
    await ctx.db.insert("classSchedule", {
      classId, lessonIds: [lesson2Id], scheduledStart: tomorrow10AM.getTime(), scheduledEnd: tomorrow10AM.getTime() + oneHour, roomName: `class-${classId}-lesson-${lesson2Id}-${tomorrow10AM.getTime()}`, status: "scheduled", isLive: false, createdAt: now, createdBy: teacherId,
    });

    const nextWeek = now + (7 * 24 * 60 * 60 * 1000);
    await ctx.db.insert("classSchedule", {
      classId, lessonIds: [lesson3Id], scheduledStart: nextWeek, scheduledEnd: nextWeek + oneHour, roomName: `class-${classId}-lesson-${lesson3Id}-${nextWeek}`, status: "scheduled", isLive: false, createdAt: now, createdBy: teacherId,
    });

    const yesterday = now - (24 * 60 * 60 * 1000);
    await ctx.db.insert("classSchedule", {
      classId, lessonIds: [lesson1Id], scheduledStart: yesterday, scheduledEnd: yesterday + oneHour, roomName: `class-${classId}-lesson-${lesson1Id}-${yesterday}`, status: "completed", isLive: false, completedAt: yesterday + oneHour, createdAt: yesterday - (2 * 24 * 60 * 60 * 1000), createdBy: teacherId,
    });

    // 9. SAMPLE ATTENDANCE
    for (const studentId of studentIds) {
      await ctx.db.insert("class_sessions", {
        scheduleId: schedule1Id, studentId, joinedAt: yesterday + (5 * 60 * 1000), leftAt: yesterday + (55 * 60 * 1000), durationSeconds: 50 * 60, roomName: `class-${classId}-lesson-${lesson1Id}-${yesterday}`, sessionDate: new Date(yesterday).toISOString().split('T')[0],
      });
    }

    return { message: "Multi-Tenant Seed complete!" };
  },
});