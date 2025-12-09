import { query } from "./_generated/server";

export const getMyClasses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "teacher") return [];

    // Get all assignments for this teacher
    const assignments = await ctx.db
      .query("teacher_assignments")
      .withIndex("by_teacher_active", q => 
        q.eq("teacherId", user._id).eq("isActive", true)
      )
      .collect();

    // Fetch curriculum details for names
    const classes = await Promise.all(assignments.map(async (a) => {
      const curriculum = await ctx.db.get(a.curriculumId);
      
      // Calculate Room Name (Must match student's logic: CODE-GROUP)
      // If the teacher has multiple groups, we should ideally return one entry per group.
      // For MVP, assuming single group or taking the first one:
      const groupCode = a.assignedGroupCodes?.[0] || "A"; // Fallback to 'A' if undefined
      const roomName = `${curriculum?.code || curriculum?._id}-${groupCode}`;

      return {
        assignmentId: a._id,
        className: curriculum?.name || "Unknown Class",
        roomName: roomName,
        grade: a.assignedGrades?.[0] || "General",
        group: groupCode
      };
    }));

    return classes;
  }
});