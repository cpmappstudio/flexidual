import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get the "Source" Menu items (Classes) for the CURRENT logged-in student.
 */
export const getStudentClasses = query({
  args: {}, 
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return []; 

    const student = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .first();

    if (!student || student.role !== "student" || !student.studentProfile) {
      return [];
    }

    const { campusId, studentProfile } = student;
    if (!campusId) return [];

    // Find active curriculums
    const curriculums = await ctx.db
      .query("curriculums")
      .withIndex("by_active", q => q.eq("isActive", true))
      .collect();

    // Filter by campus/grade
    const myCurriculums = curriculums.filter(c => {
      const campusAssignment = c.campusAssignments?.find(ca => ca.campusId === campusId);
      return campusAssignment?.gradeCodes.includes(studentProfile.gradeCode);
    });

    const classes = await Promise.all(myCurriculums.map(async (curr) => {
      const assignment = await ctx.db
        .query("teacher_assignments")
        .withIndex("by_campus_curriculum", q => 
            q.eq("campusId", campusId).eq("curriculumId", curr._id).eq("isActive", true)
        )
        .collect();

      const relevantAssignment = assignment.find(a => 
        a.assignedGroupCodes?.includes(studentProfile.groupCode) || 
        a.assignedGrades?.includes(studentProfile.gradeCode)
      );

      const teacher = relevantAssignment ? await ctx.db.get(relevantAssignment.teacherId) : null;

      // === CRITICAL FIX: Normalize Room Name ===
      // Match Teacher Logic: If group is "05-A", we want just "A"
      // Result: "MATH-05" + "-" + "A" = "MATH-05-A"
      const rawGroup = studentProfile.groupCode;
      const groupSuffix = rawGroup.includes('-') ? rawGroup.split('-')[1] : rawGroup;
      
      const roomName = `${curr.code || curr._id}-${groupSuffix}`; 

      return {
        curriculumId: curr._id,
        name: curr.name,
        roomName: roomName, // Now matches Teacher's "MATH-05-A"
        teacher: teacher ? {
           name: teacher.fullName,
           photo: teacher.avatarStorageId
        } : null,
      };
    }));

    return classes;
  }
});

/**
 * Heartbeat / Check-in
 * Called by the frontend every minute to update the "Green Light" and "Time in Class".
 */
export const logStudentHeartbeat = mutation({
  args: { 
    studentId: v.id("users"), 
    roomName: v.string() // Current class they are in
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Update User Online Status
    await ctx.db.patch(args.studentId, {
      onlineStatus: {
        state: "in_class",
        lastSeen: now,
        currentRoomId: args.roomName
      }
    });

    // Find active session for this room to update "leftAt" (keep session alive)
    // In a real implementation, we'd handle session creation on "Room Join" 
    // and just extend the time here.
  }
});