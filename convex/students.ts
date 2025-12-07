import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get the "Source" Menu items (Classes) for a student.
 * This looks up the student's grade/group and finds which curriculums/teachers are assigned.
 */
export const getStudentClasses = query({
  args: { studentId: v.id("users") },
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    if (!student || student.role !== "student" || !student.studentProfile) {
      return [];
    }

    const { campusId, studentProfile } = student;
    if (!campusId) return [];

    // 1. Find all active curriculums at this campus
    const curriculums = await ctx.db
      .query("curriculums")
      .withIndex("by_active", q => q.eq("isActive", true))
      .collect();

    // 2. Filter for curriculums that include the student's grade
    const myCurriculums = curriculums.filter(c => {
      const campusAssignment = c.campusAssignments?.find(ca => ca.campusId === campusId);
      return campusAssignment?.gradeCodes.includes(studentProfile.gradeCode);
    });

    // 3. Enhance with Teacher info (The "Drag and Drop" targets)
    const classes = await Promise.all(myCurriculums.map(async (curr) => {
      // Find the teacher assigned to this student's specific GROUP (e.g., "05-A")
      const assignment = await ctx.db
        .query("teacher_assignments")
        .withIndex("by_campus_curriculum", q => 
            q.eq("campusId", campusId).eq("curriculumId", curr._id).eq("isActive", true)
        )
        .collect();

      // Filter for the assignment that covers the student's group
      const relevantAssignment = assignment.find(a => 
        a.assignedGroupCodes?.includes(studentProfile.groupCode) || 
        a.assignedGrades?.includes(studentProfile.gradeCode)
      );

      const teacher = relevantAssignment ? await ctx.db.get(relevantAssignment.teacherId) : null;

      return {
        curriculumId: curr._id,
        name: curr.name,
        // This is the "Room Name" used for LiveKit connection
        roomName: `${curr.code || curr._id}-${studentProfile.groupCode}`, 
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