import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeTenantSlug } from "../../lib/tenancy/slug";
import { requireCampusInOrganization } from "./campuses";
import { throwAppError } from "./errors";
import { requireOrganizationById } from "./organizations";
import {
  MAX_ACADEMIC_GRADE_LEVELS_PER_ORGANIZATION,
  MAX_CAMPUS_GRADE_OFFERINGS_PER_CAMPUS,
} from "./queryLimits";

type Context = QueryCtx | MutationCtx;

function normalizeAcademicGradeLevelName(value: string) {
  const name = value.trim();
  if (!name) {
    throwAppError("ACADEMIC_GRADE_LEVEL_NAME_REQUIRED");
  }

  return name;
}

function normalizeAcademicGradeLevelCode(value: string) {
  const code = normalizeTenantSlug(value);
  if (!code) {
    throwAppError("ACADEMIC_GRADE_LEVEL_CODE_REQUIRED");
  }

  return code;
}

function normalizeOptionalStage(value: string | undefined) {
  const stage = value?.trim();
  return stage || undefined;
}

function normalizeSortOrder(value: number) {
  if (!Number.isSafeInteger(value)) {
    throwAppError("ACADEMIC_GRADE_LEVEL_SORT_ORDER_INVALID");
  }

  return value;
}

export async function requireAcademicGradeLevelInOrganization(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    gradeLevelId: Id<"academicGradeLevels">;
  },
) {
  const gradeLevel = await ctx.db.get("academicGradeLevels", args.gradeLevelId);
  if (!gradeLevel) {
    throwAppError("ACADEMIC_GRADE_LEVEL_NOT_FOUND");
  }

  if (gradeLevel.organizationId !== args.organizationId) {
    throwAppError("ACADEMIC_GRADE_LEVEL_SCOPE_MISMATCH");
  }

  return gradeLevel;
}

export async function getAcademicGradeLevelByCode(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    code: string;
  },
) {
  const code = normalizeAcademicGradeLevelCode(args.code);

  return await ctx.db
    .query("academicGradeLevels")
    .withIndex("by_organization_id_and_code", (query) =>
      query.eq("organizationId", args.organizationId).eq("code", code),
    )
    .unique();
}

export async function listAcademicGradeLevelsForOrganization(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
  },
) {
  return await ctx.db
    .query("academicGradeLevels")
    .withIndex("by_organization_id_and_sort_order", (query) =>
      query.eq("organizationId", args.organizationId),
    )
    .take(MAX_ACADEMIC_GRADE_LEVELS_PER_ORGANIZATION);
}

export async function createAcademicGradeLevel(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    name: string;
    code: string;
    stage?: string;
    sortOrder: number;
  },
) {
  await requireOrganizationById(ctx, args.organizationId);

  const name = normalizeAcademicGradeLevelName(args.name);
  const code = normalizeAcademicGradeLevelCode(args.code);
  const stage = normalizeOptionalStage(args.stage);
  const sortOrder = normalizeSortOrder(args.sortOrder);
  const existingGradeLevel = await getAcademicGradeLevelByCode(ctx, {
    organizationId: args.organizationId,
    code,
  });
  if (existingGradeLevel) {
    throwAppError("ACADEMIC_GRADE_LEVEL_CODE_ALREADY_EXISTS");
  }
  const gradeLevels = await listAcademicGradeLevelsForOrganization(ctx, {
    organizationId: args.organizationId,
  });
  if (gradeLevels.length >= MAX_ACADEMIC_GRADE_LEVELS_PER_ORGANIZATION) {
    throwAppError("ACADEMIC_GRADE_LEVEL_LIMIT_EXCEEDED");
  }

  const now = Date.now();
  const gradeLevelId = await ctx.db.insert("academicGradeLevels", {
    organizationId: args.organizationId,
    name,
    code,
    stage,
    sortOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const gradeLevel = await ctx.db.get("academicGradeLevels", gradeLevelId);
  if (!gradeLevel) {
    throwAppError("ACADEMIC_GRADE_LEVEL_CREATE_FAILED");
  }

  return gradeLevel;
}

export async function updateAcademicGradeLevel(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    gradeLevelId: Id<"academicGradeLevels">;
    name?: string;
    code?: string;
    stage?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const gradeLevel = await requireAcademicGradeLevelInOrganization(ctx, args);
  const patch: Partial<
    Pick<
      Doc<"academicGradeLevels">,
      "name" | "code" | "stage" | "sortOrder" | "isActive" | "updatedAt"
    >
  > = {};

  if (args.name !== undefined) {
    patch.name = normalizeAcademicGradeLevelName(args.name);
  }

  if (args.code !== undefined) {
    const code = normalizeAcademicGradeLevelCode(args.code);
    if (code !== gradeLevel.code) {
      const existingGradeLevel = await getAcademicGradeLevelByCode(ctx, {
        organizationId: args.organizationId,
        code,
      });
      if (existingGradeLevel) {
        throwAppError("ACADEMIC_GRADE_LEVEL_CODE_ALREADY_EXISTS");
      }
    }

    patch.code = code;
  }

  if (args.stage !== undefined) {
    patch.stage = normalizeOptionalStage(args.stage);
  }

  if (args.sortOrder !== undefined) {
    patch.sortOrder = normalizeSortOrder(args.sortOrder);
  }

  if (args.isActive !== undefined) {
    if (!args.isActive && gradeLevel.isActive) {
      const activeOffering = await getActiveCampusGradeOfferingForGradeLevel(ctx, {
        organizationId: args.organizationId,
        gradeLevelId: gradeLevel._id,
      });
      if (activeOffering) {
        throwAppError("ACADEMIC_GRADE_LEVEL_HAS_ACTIVE_CAMPUS_OFFERINGS");
      }
    }

    patch.isActive = args.isActive;
  }

  patch.updatedAt = Date.now();
  await ctx.db.patch("academicGradeLevels", gradeLevel._id, patch);

  const updatedGradeLevel = await ctx.db.get("academicGradeLevels", gradeLevel._id);
  if (!updatedGradeLevel) {
    throwAppError("ACADEMIC_GRADE_LEVEL_NOT_FOUND");
  }

  return updatedGradeLevel;
}

async function listCampusGradeOfferingsForCampus(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
  },
) {
  return await ctx.db
    .query("campusGradeOfferings")
    .withIndex("by_organization_id_and_campus_id_and_grade_level_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("campusId", args.campusId),
    )
    .take(MAX_CAMPUS_GRADE_OFFERINGS_PER_CAMPUS);
}

export async function getCampusGradeOffering(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
    gradeLevelId: Id<"academicGradeLevels">;
  },
) {
  // Uniqueness is maintained by the upsert flow; Convex indexes do not enforce it.
  return await ctx.db
    .query("campusGradeOfferings")
    .withIndex("by_organization_id_and_campus_id_and_grade_level_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("campusId", args.campusId)
        .eq("gradeLevelId", args.gradeLevelId),
    )
    .unique();
}

async function getActiveCampusGradeOfferingForGradeLevel(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    gradeLevelId: Id<"academicGradeLevels">;
  },
) {
  const [offering] = await ctx.db
    .query("campusGradeOfferings")
    .withIndex("by_organization_id_and_grade_level_id_and_is_active", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("gradeLevelId", args.gradeLevelId)
        .eq("isActive", true),
    )
    .take(1);

  return offering ?? null;
}

export async function upsertCampusGradeOffering(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
    gradeLevelId: Id<"academicGradeLevels">;
    isActive: boolean;
  },
) {
  await requireCampusInOrganization(ctx, {
    organizationId: args.organizationId,
    campusId: args.campusId,
  });
  const gradeLevel = await requireAcademicGradeLevelInOrganization(ctx, {
    organizationId: args.organizationId,
    gradeLevelId: args.gradeLevelId,
  });
  if (args.isActive && !gradeLevel.isActive) {
    throwAppError("ACADEMIC_GRADE_LEVEL_INACTIVE");
  }

  const existingOffering = await getCampusGradeOffering(ctx, args);
  const now = Date.now();

  if (existingOffering) {
    await ctx.db.patch("campusGradeOfferings", existingOffering._id, {
      isActive: args.isActive,
      updatedAt: now,
    });

    const offering = await ctx.db.get("campusGradeOfferings", existingOffering._id);
    if (!offering) {
      throwAppError("CAMPUS_GRADE_OFFERING_NOT_FOUND");
    }

    return offering;
  }

  const existingOfferings = await listCampusGradeOfferingsForCampus(ctx, args);
  if (existingOfferings.length >= MAX_CAMPUS_GRADE_OFFERINGS_PER_CAMPUS) {
    throwAppError("CAMPUS_GRADE_OFFERING_LIMIT_EXCEEDED");
  }

  const offeringId = await ctx.db.insert("campusGradeOfferings", {
    organizationId: args.organizationId,
    campusId: args.campusId,
    gradeLevelId: args.gradeLevelId,
    isActive: args.isActive,
    createdAt: now,
    updatedAt: now,
  });
  const offering = await ctx.db.get("campusGradeOfferings", offeringId);
  if (!offering) {
    throwAppError("CAMPUS_GRADE_OFFERING_CREATE_FAILED");
  }

  return offering;
}

export async function deactivateCampusGradeOffering(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
    gradeLevelId: Id<"academicGradeLevels">;
  },
) {
  await requireCampusInOrganization(ctx, {
    organizationId: args.organizationId,
    campusId: args.campusId,
  });
  await requireAcademicGradeLevelInOrganization(ctx, {
    organizationId: args.organizationId,
    gradeLevelId: args.gradeLevelId,
  });

  const existingOffering = await getCampusGradeOffering(ctx, args);
  if (!existingOffering) {
    throwAppError("CAMPUS_GRADE_OFFERING_NOT_FOUND");
  }

  await ctx.db.patch("campusGradeOfferings", existingOffering._id, {
    isActive: false,
    updatedAt: Date.now(),
  });

  const offering = await ctx.db.get("campusGradeOfferings", existingOffering._id);
  if (!offering) {
    throwAppError("CAMPUS_GRADE_OFFERING_NOT_FOUND");
  }

  return offering;
}

export async function buildCampusGradeOfferingRecord(
  ctx: Context,
  offering: Doc<"campusGradeOfferings">,
) {
  const gradeLevel = await requireAcademicGradeLevelInOrganization(ctx, {
    organizationId: offering.organizationId,
    gradeLevelId: offering.gradeLevelId,
  });

  return {
    _id: offering._id,
    _creationTime: offering._creationTime,
    organizationId: offering.organizationId,
    campusId: offering.campusId,
    gradeLevelId: offering.gradeLevelId,
    isActive: offering.isActive,
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
    gradeLevel,
  };
}

export async function listCampusGradeOfferingRecordsForCampus(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
  },
) {
  await requireCampusInOrganization(ctx, args);

  const offerings = await listCampusGradeOfferingsForCampus(ctx, args);

  return await Promise.all(
    offerings.map((offering) => buildCampusGradeOfferingRecord(ctx, offering)),
  );
}
