import { QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Checks if a user has a specific system-wide role (like superadmin or global admin)
 */
export async function hasSystemRole(
  ctx: QueryCtx, 
  userId: Id<"users">, 
  allowedRoles: string[]
): Promise<boolean> {
  // Query by user first, then filter by orgType to satisfy Convex index rules
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("orgType"), "system"))
    .collect();

  return assignments.some(a => allowedRoles.includes(a.role));
}

/**
 * Checks if a user has a specific role within a specific organization context (School or Campus).
 * Note: System Superadmins automatically pass this check.
 */
export async function hasOrgRole(
  ctx: QueryCtx,
  userId: Id<"users">,
  orgId: string, // Can be schoolId or campusId
  orgType: "school" | "campus",
  allowedRoles: string[]
): Promise<boolean> {
  // 1. Check if they are a system superadmin (override)
  const isSuperAdmin = await hasSystemRole(ctx, userId, ["superadmin"]);
  if (isSuperAdmin) return true;

  // 2. Query by user, then filter by context to avoid composite index order errors
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => 
      q.and(
        q.eq(q.field("orgId"), orgId),
        q.eq(q.field("orgType"), orgType)
      )
    )
    .collect();

  return assignments.some(a => allowedRoles.includes(a.role));
}

export async function canModifyCurriculumContent(
  ctx: QueryCtx,
  userId: Id<"users">,
  curriculumId: Id<"curriculums">
): Promise<boolean> {
  const curriculum = await ctx.db.get(curriculumId);
  if (!curriculum) return false;

  // 1. Superadmins can do anything
  const isSuperAdmin = await hasSystemRole(ctx, userId, ["superadmin"]);
  if (isSuperAdmin) return true;

  // If curriculum has no school, only superadmins can touch it
  if (!curriculum.schoolId) return false;

  // 2. School Admins can do anything within their school
  const isSchoolAdmin = await hasOrgRole(ctx, userId, curriculum.schoolId, "school", ["admin"]);
  if (isSchoolAdmin) return true;

  // 3. Teachers can only modify if they are assigned to a class using it
  const isTeacher = await hasOrgRole(ctx, userId, curriculum.schoolId, "school", ["teacher"]);
  if (isTeacher) {
    const hasClass = await ctx.db
      .query("classes")
      .withIndex("by_teacher", (q) => q.eq("teacherId", userId).eq("isActive", true))
      .filter((q) => q.eq(q.field("curriculumId"), curriculumId))
      .first();
    
    return !!hasClass; // Returns true if they have a class, false otherwise
  }

  return false;
}

export async function canManageClasses(
  ctx: QueryCtx,
  userId: Id<"users">,
  campusId?: Id<"campuses">,
  schoolId?: Id<"schools">
): Promise<boolean> {
  // 1. Superadmin override
  if (await hasSystemRole(ctx, userId, ["superadmin"])) return true;
  
  // 2. Campus Admin/Principal check
  if (campusId && await hasOrgRole(ctx, userId, campusId, "campus", ["admin", "principal"])) return true;
  
  // 3. School Admin check (School Admins can manage classes in any of their campuses)
  if (schoolId && await hasOrgRole(ctx, userId, schoolId, "school", ["admin"])) return true;
  
  return false;
}

export async function canManageCurriculums(
  ctx: QueryCtx,
  userId: Id<"users">,
  schoolId?: Id<"schools">
): Promise<boolean> {
  // 1. Superadmin override
  if (await hasSystemRole(ctx, userId, ["superadmin"])) return true;
  
  // 2. School Admin check (Only school admins manage curriculum templates)
  if (schoolId && await hasOrgRole(ctx, userId, schoolId, "school", ["admin"])) return true;
  
  return false;
}