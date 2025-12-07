import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * SEED FLEXIDUAL: Creates a complete test environment
 * 1. Campus (Neptune)
 * 2. Curriculum (Mathematics 5th Grade)
 * 3. Teacher (Assigned to 5th Grade, Group A)
 * 4. Student (Enrolled in 5th Grade, Group A)
 */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. GET OR CREATE CAMPUS (Neptune)
    let campus = await ctx.db
      .query("campuses")
      .filter(q => q.eq(q.field("code"), "NEPT-HS"))
      .first();

    if (!campus) {
        // Fallback if seedCampuses hasn't run
        console.log("Neptune campus not found. Please run seedCampuses first or we will create a basic one.");
        // For safety, I'll abort if campus is missing to ensure consistency
        throw new Error("Please run the 'seedCampuses' mutation first!");
    }

    console.log(`Using Campus: ${campus.name}`);

    // 2. CREATE TEACHER (Tony Stark)
    // We check by email to avoid duplicates
    let teacherId = (await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", "tony@stark.com"))
      .first())?._id;

    if (!teacherId) {
      teacherId = await ctx.db.insert("users", {
        clerkId: "mock_teacher_clerk_id", // Placeholder
        email: "tony@stark.com",
        firstName: "Tony",
        lastName: "Stark",
        fullName: "Tony Stark",
        role: "teacher",
        campusId: campus._id,
        isActive: true,
        status: "active",
        createdAt: now,
      });
    }

    // 3. CREATE CURRICULUM (Mathematics)
    let mathCurriculum = await ctx.db
      .query("curriculums")
      .withIndex("by_name", q => q.eq("name", "Mathematics - Grade 5"))
      .first();

    if (!mathCurriculum) {
      const curriculumId = await ctx.db.insert("curriculums", {
        name: "Mathematics - Grade 5",
        code: "MATH-05",
        description: "Standard 5th Grade Math",
        numberOfQuarters: 4,
        isActive: true,
        status: "active",
        createdAt: now,
        createdBy: teacherId,
        // Crucial: Assign to Campus with Grade 05
        campusAssignments: [{
            campusId: campus._id,
            assignedTeachers: [teacherId],
            gradeCodes: ["05"]
        }]
      });
      mathCurriculum = await ctx.db.get(curriculumId);
    }

    if (!mathCurriculum) throw new Error("Failed to create curriculum");

    // 4. ASSIGN TEACHER TO CLASS (Group 05-A)
    const existingAssignment = await ctx.db
        .query("teacher_assignments")
        .withIndex("by_teacher_campus", q => 
            q.eq("teacherId", teacherId!).eq("campusId", campus!._id).eq("isActive", true)
        )
        .filter(q => q.eq(q.field("curriculumId"), mathCurriculum!._id))
        .first();

    if (!existingAssignment) {
        await ctx.db.insert("teacher_assignments", {
            teacherId: teacherId,
            curriculumId: mathCurriculum._id,
            campusId: campus._id,
            academicYear: "2025-2026",
            startDate: now,
            assignmentType: "primary",
            // CRITICAL: This links the teacher specifically to Group A
            assignedGrades: ["05"],
            assignedGroupCodes: ["05-A"], 
            isActive: true,
            status: "active",
            assignedAt: now,
            assignedBy: teacherId, // Self-assigned for seed
        });
    }

    // 5. CREATE STUDENT (Peter Parker)
    // He is in Grade 05, Group A. This matches the teacher assignment above.
    let studentId = (await ctx.db
        .query("users")
        .withIndex("by_email", q => q.eq("email", "peter@parker.com"))
        .first())?._id;
  
      if (!studentId) {
        studentId = await ctx.db.insert("users", {
          clerkId: "mock_student_clerk_id", // Placeholder
          email: "peter@parker.com",
          firstName: "Peter",
          lastName: "Parker",
          fullName: "Peter Parker",
          role: "student",
          campusId: campus._id,
          isActive: true,
          status: "active",
          createdAt: now,
          // NEW STUDENT PROFILE
          studentProfile: {
              gradeCode: "05",
              groupCode: "05-A", // Matches the teacher's group
              parentName: "Aunt May",
              parentEmail: "may@parker.com"
          }
        });
      }

    return {
        success: true,
        message: "Seed Complete! Created Teacher (Tony) and Student (Peter) linked via Math 05-A.",
        teacherId,
        studentId
    };
  },
});

/**
 * DEV TOOL: Adopt a Role
 * Call this from the frontend (or Convex dashboard) to make YOUR logged-in user
 * take over the data of the seeded student or teacher.
 */
export const adoptRole = mutation({
    args: { 
        targetEmail: v.string() // e.g., "peter@parker.com"
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("You must be logged in to adopt a role.");

        // 1. Find your actual user record
        const myUser = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
            .first();

        if (!myUser) throw new Error("Your user record was not found.");

        // 2. Find the target seed user (e.g., Peter Parker)
        const targetUser = await ctx.db
            .query("users")
            .withIndex("by_email", q => q.eq("email", args.targetEmail))
            .first();

        if (!targetUser) throw new Error("Target seed user not found.");

        // 3. COPY METADATA: Move Peter's role/profile to YOU
        await ctx.db.patch(myUser._id, {
            role: targetUser.role,
            campusId: targetUser.campusId,
            studentProfile: targetUser.studentProfile, // Important for students
            // Keep your own name/email so login still works
        });

        return {
            success: true,
            message: `You are now ${targetUser.fullName} (${targetUser.role})!`
        };
    }
});