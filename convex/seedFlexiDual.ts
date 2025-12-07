import { mutation, internalMutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
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
        throw new Error("Please run the 'seedCampuses' mutation first!");
    }

    console.log(`Using Campus: ${campus.name}`);

    // 2. CREATE TEACHER (Tony Stark)
    let teacherId = (await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", "tony@stark.com"))
      .first())?._id;

    if (!teacherId) {
      teacherId = await ctx.db.insert("users", {
        clerkId: "mock_teacher_clerk_id",
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
            assignedGrades: ["05"],
            assignedGroupCodes: ["05-A"], 
            isActive: true,
            status: "active",
            assignedAt: now,
            assignedBy: teacherId,
        });
    }

    // 5. CREATE STUDENT (Peter Parker)
    let studentId = (await ctx.db
        .query("users")
        .withIndex("by_email", q => q.eq("email", "peter@parker.com"))
        .first())?._id;
  
      if (!studentId) {
        studentId = await ctx.db.insert("users", {
          clerkId: "mock_student_clerk_id",
          email: "peter@parker.com",
          firstName: "Peter",
          lastName: "Parker",
          fullName: "Peter Parker",
          role: "student",
          campusId: campus._id,
          isActive: true,
          status: "active",
          createdAt: now,
          studentProfile: {
              gradeCode: "05",
              groupCode: "05-A",
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

// Define return type interface
interface AdoptRoleResult {
  success: boolean;
  clerkId: string;
  newRole: string;
  userName: string;
}

/**
 * INTERNAL MUTATION: Updates the Convex DB profile
 */
export const internalAdoptRole = internalMutation({
    args: { 
        targetEmail: v.string(), 
        actorEmail: v.optional(v.string()) 
    },
    handler: async (ctx, args): Promise<AdoptRoleResult> => {
        let userToUpdate;

        const identity = await ctx.auth.getUserIdentity();
        if (identity) {
             userToUpdate = await ctx.db
                .query("users")
                .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
                .first();
        } else if (args.actorEmail) {
            userToUpdate = await ctx.db
                .query("users")
                .withIndex("by_email", q => q.eq("email", args.actorEmail || ""))
                .first();
        }

        if (!userToUpdate) {
            throw new Error("Could not find YOUR user record.");
        }

        const targetUser = await ctx.db
            .query("users")
            .withIndex("by_email", q => q.eq("email", args.targetEmail))
            .first();

        if (!targetUser) throw new Error(`Target seed user '${args.targetEmail}' not found.`);

        await ctx.db.patch(userToUpdate._id, {
            role: targetUser.role,
            campusId: targetUser.campusId,
            studentProfile: targetUser.studentProfile,
        });

        return {
            success: true,
            clerkId: userToUpdate.clerkId,
            newRole: targetUser.role,
            userName: targetUser.fullName
        };
    }
});

/**
 * PUBLIC ACTION: Syncs both Convex DB and Clerk Metadata
 */
export const adoptRole = action({
    args: { 
        targetEmail: v.string(), 
        actorEmail: v.optional(v.string()) 
    },
    handler: async (ctx, args): Promise<AdoptRoleResult & { warning?: string }> => {
        // Explicitly type the result
        const result: AdoptRoleResult = await ctx.runMutation(
            internal.seedFlexiDual.internalAdoptRole, 
            args
        );
        
        if (result.success && result.clerkId && !result.clerkId.startsWith("mock")) {
             const clerkSecretKey = process.env.CLERK_SECRET_KEY;
             
             if (!clerkSecretKey) {
                 console.warn("⚠️ CLERK_SECRET_KEY not set. Clerk metadata was NOT updated.");
                 return { ...result, warning: "Role updated in DB, but Clerk Secret Key is missing." };
             }

             try {
                 const response = await fetch(`https://api.clerk.com/v1/users/${result.clerkId}`, {
                     method: 'PATCH',
                     headers: {
                         'Authorization': `Bearer ${clerkSecretKey}`,
                         'Content-Type': 'application/json'
                     },
                     body: JSON.stringify({
                         public_metadata: {
                             role: result.newRole
                         }
                     })
                 });

                 if (!response.ok) {
                    console.error("Clerk API Error:", await response.text());
                 } else {
                    console.log(`✅ Clerk metadata updated to: ${result.newRole}`);
                 }
             } catch (e) {
                 console.error("Failed to update Clerk:", e);
             }
        }
        
        return result;
    }
});