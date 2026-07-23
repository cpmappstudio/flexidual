import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  buildCampusGradeOfferingRecord,
  createAcademicGradeLevel,
  deactivateCampusGradeOffering,
  listAcademicGradeLevelsForOrganization,
  listCampusGradeOfferingRecordsForCampus,
  updateAcademicGradeLevel,
  upsertCampusGradeOffering,
} from "../lib/academic";
import { requireOrganizationRole } from "../lib/authz";
import {
  academicGradeLevelValidator,
  campusGradeOfferingRecordValidator,
} from "../lib/validators";

export const listGradeLevels = query({
  args: {
    slug: v.string(),
  },
  returns: v.array(academicGradeLevelValidator),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    return await listAcademicGradeLevelsForOrganization(ctx, {
      organizationId: access.organization._id,
    });
  },
});

export const createGradeLevel = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    code: v.string(),
    stage: v.optional(v.string()),
    sortOrder: v.number(),
  },
  returns: academicGradeLevelValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    return await createAcademicGradeLevel(ctx, {
      organizationId: access.organization._id,
      name: args.name,
      code: args.code,
      stage: args.stage,
      sortOrder: args.sortOrder,
    });
  },
});

export const updateGradeLevel = mutation({
  args: {
    slug: v.string(),
    gradeLevelId: v.id("academicGradeLevels"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    stage: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: academicGradeLevelValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    return await updateAcademicGradeLevel(ctx, {
      organizationId: access.organization._id,
      gradeLevelId: args.gradeLevelId,
      name: args.name,
      code: args.code,
      stage: args.stage,
      sortOrder: args.sortOrder,
      isActive: args.isActive,
    });
  },
});

export const listGradeOfferingsForCampus = query({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
  },
  returns: v.array(campusGradeOfferingRecordValidator),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    return await listCampusGradeOfferingRecordsForCampus(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
    });
  },
});

export const assignGradeLevelToCampus = mutation({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
    gradeLevelId: v.id("academicGradeLevels"),
  },
  returns: campusGradeOfferingRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const offering = await upsertCampusGradeOffering(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
      gradeLevelId: args.gradeLevelId,
      isActive: true,
    });

    return await buildCampusGradeOfferingRecord(ctx, offering);
  },
});

export const unassignGradeLevelFromCampus = mutation({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
    gradeLevelId: v.id("academicGradeLevels"),
  },
  returns: campusGradeOfferingRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const offering = await deactivateCampusGradeOffering(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
      gradeLevelId: args.gradeLevelId,
    });

    return await buildCampusGradeOfferingRecord(ctx, offering);
  },
});
