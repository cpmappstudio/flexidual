import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import {
  canAccessCampus,
  canAccessSchool,
  canViewInstitutionSettings,
  hasOrgRole,
  hasStaffAccess,
  hasSystemRole,
} from "./permissions";
import { roleValidator, type UserRole } from "./model/roles";
import type { Doc, Id } from "./_generated/dataModel";

const switcherSchoolValidator = v.object({
  _id: v.id("schools"),
  name: v.string(),
  slug: v.string(),
});

const switcherCampusValidator = v.object({
  _id: v.id("campuses"),
  schoolId: v.id("schools"),
  name: v.string(),
  slug: v.string(),
  code: v.optional(v.string()),
});

const staffRolePriority: UserRole[] = [
  "superadmin",
  "admin",
  "principal",
  "teacher",
  "tutor",
];

function highestStaffRole(roles: UserRole[]) {
  return staffRolePriority.find((role) => roles.includes(role));
}

/**
 * Resolves a URL slug into a concrete Organization ID and Type.
 * Used by the frontend to determine its current context.
 */
export const resolveSlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      type: v.literal("system"),
      _id: v.optional(v.id("schools")),
      name: v.string(),
    }),
    v.object({
      type: v.literal("school"),
      _id: v.id("schools"),
      name: v.string(),
    }),
    v.object({
      type: v.literal("campus"),
      _id: v.id("campuses"),
      name: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    // 1. Check if it's the global system dashboard
    if (args.slug === "system" || args.slug === "admin") {
      if (!(await hasStaffAccess(ctx, user._id))) {
        throw new ConvexError("PERMISSION_DENIED");
      }
      return { type: "system" as const, _id: undefined, name: "Global System" };
    }

    // 2. Check if it's a School
    const school = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (school) {
      if (!(await canAccessSchool(ctx, user._id, school._id))) {
        throw new ConvexError("PERMISSION_DENIED");
      }
      return { type: "school" as const, _id: school._id, name: school.name };
    }

    // 3. Check if it's a Campus
    const campus = await ctx.db
      .query("campuses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (campus) {
      if (
        !(await canAccessCampus(ctx, user._id, campus._id, campus.schoolId))
      ) {
        throw new ConvexError("PERMISSION_DENIED");
      }
      return { type: "campus" as const, _id: campus._id, name: campus.name };
    }

    return null; // Not found
  },
});

export const getSwitcherOptions = query({
  args: {},
  returns: v.object({
    schools: v.array(switcherSchoolValidator),
    campuses: v.array(switcherCampusValidator),
    canCreateInstitutions: v.boolean(),
    manageableSchoolIds: v.array(v.id("schools")),
  }),
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const isSuperadmin = await hasSystemRole(ctx, user._id, ["superadmin"]);

    if (isSuperadmin) {
      const [schools, campuses] = await Promise.all([
        ctx.db
          .query("schools")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .collect(),
        ctx.db
          .query("campuses")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .collect(),
      ]);
      return {
        schools: schools
          .map(({ _id, name, slug }) => ({ _id, name, slug }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        campuses: campuses
          .map(({ _id, schoolId, name, slug, code }) => ({
            _id,
            schoolId,
            name,
            slug,
            code,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        canCreateInstitutions: true,
        manageableSchoolIds: schools.map((school) => school._id),
      };
    }

    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const manageableSchoolIds = new Set<Id<"schools">>();
    const directCampusIds = new Set<Id<"campuses">>();

    for (const assignment of assignments) {
      if (
        assignment.orgType === "school" &&
        assignment.role === "admin" &&
        assignment.orgId
      ) {
        const schoolId = ctx.db.normalizeId("schools", assignment.orgId);
        if (schoolId) manageableSchoolIds.add(schoolId);
      } else if (
        assignment.orgType === "campus" &&
        assignment.orgId &&
        ["principal", "teacher", "tutor"].includes(assignment.role)
      ) {
        const campusId = ctx.db.normalizeId("campuses", assignment.orgId);
        if (campusId) directCampusIds.add(campusId);
      }
    }

    const campusesBySchool = await Promise.all(
      [...manageableSchoolIds].map((schoolId) =>
        ctx.db
          .query("campuses")
          .withIndex("by_school", (q) =>
            q.eq("schoolId", schoolId).eq("isActive", true),
          )
          .collect(),
      ),
    );
    const directCampuses = await Promise.all(
      [...directCampusIds].map((campusId) => ctx.db.get(campusId)),
    );
    const campusMap = new Map<Id<"campuses">, Doc<"campuses">>();
    for (const campus of [...campusesBySchool.flat(), ...directCampuses]) {
      if (campus?.isActive) campusMap.set(campus._id, campus);
    }

    const schoolIds = new Set<Id<"schools">>(manageableSchoolIds);
    for (const campus of campusMap.values()) schoolIds.add(campus.schoolId);
    const schools = (
      await Promise.all([...schoolIds].map((schoolId) => ctx.db.get(schoolId)))
    ).filter((school): school is Doc<"schools"> => !!school?.isActive);

    return {
      schools: schools
        .map(({ _id, name, slug }) => ({ _id, name, slug }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      campuses: [...campusMap.values()]
        .map(({ _id, schoolId, name, slug, code }) => ({
          _id,
          schoolId,
          name,
          slug,
          code,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      canCreateInstitutions: false,
      manageableSchoolIds: [...manageableSchoolIds],
    };
  },
});

export const getStaffContext = query({
  args: { orgSlug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      role: roleValidator,
      canManageCampus: v.boolean(),
      canViewPeople: v.boolean(),
      canManagePeople: v.boolean(),
      canViewInstitutionSettings: v.boolean(),
      canManageInstitution: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (await hasSystemRole(ctx, user._id, ["superadmin"])) {
      return {
        role: "superadmin" as const,
        canManageCampus: true,
        canViewPeople: true,
        canManagePeople: true,
        canViewInstitutionSettings: true,
        canManageInstitution: true,
      };
    }

    const school = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();
    const campus = school
      ? null
      : await ctx.db
          .query("campuses")
          .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
          .first();
    const schoolId = school?._id ?? campus?.schoolId;
    if (!schoolId) return null;

    if (await hasOrgRole(ctx, user._id, schoolId, "school", ["admin"])) {
      return {
        role: "admin" as const,
        canManageCampus: true,
        canViewPeople: true,
        canManagePeople: true,
        canViewInstitutionSettings: true,
        canManageInstitution: true,
      };
    }
    if (!campus) return null;

    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user_org", (q) =>
        q
          .eq("userId", user._id)
          .eq("orgId", campus._id)
          .eq("orgType", "campus"),
      )
      .collect();
    const role = highestStaffRole(assignments.map((item) => item.role));
    if (!role) return null;
    const canManageCampus = role === "principal";

    return {
      role,
      canManageCampus,
      canViewPeople: role === "principal" || role === "teacher",
      canManagePeople: false,
      canViewInstitutionSettings: canManageCampus,
      canManageInstitution: false,
    };
  },
});

export const getSettingsContext = query({
  args: { orgSlug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      institution: v.object({
        _id: v.id("schools"),
        name: v.string(),
        slug: v.string(),
        isActive: v.boolean(),
        timeZone: v.optional(v.string()),
      }),
      canManageInstitution: v.boolean(),
      canViewInstitutionSettings: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);

    const school = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    const campus = school
      ? null
      : await ctx.db
          .query("campuses")
          .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
          .first();
    const institution =
      school ?? (campus ? await ctx.db.get(campus.schoolId) : null);

    if (!institution) return null;

    const hasCurrentOrgAccess = school
      ? await hasOrgRole(ctx, user._id, school._id, "school", ["admin"])
      : await hasOrgRole(ctx, user._id, campus!._id, "campus", [
          "admin",
          "principal",
          "teacher",
          "tutor",
          "student",
        ]);

    if (!isSuperAdmin && !hasCurrentOrgAccess) return null;

    const canManageInstitution =
      isSuperAdmin ||
      (await hasOrgRole(ctx, user._id, institution._id, "school", ["admin"]));

    return {
      institution: {
        _id: institution._id,
        name: institution.name,
        slug: institution.slug,
        isActive: institution.isActive,
        timeZone: institution.timeZone,
      },
      canManageInstitution,
      canViewInstitutionSettings:
        canManageInstitution ||
        (await canViewInstitutionSettings(ctx, user._id, institution._id)),
    };
  },
});
