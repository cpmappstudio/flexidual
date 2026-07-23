import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import {
  buildCampusResponse,
  createCampus,
  getCampusBySlug,
  requireCampusInOrganization,
} from "../lib/campuses";
import { requireOrganizationAccess, requireOrganizationRole } from "../lib/authz";
import {
  getGuardianRelationshipForGuardianAndStudent,
  listActiveCampusAssignmentsForOrganizationPerson,
} from "../lib/organizationPeople";
import { campusValidator } from "../lib/validators";
import { deleteStoredImageIfPresent } from "../lib/images";
import { throwAppError } from "../lib/errors";
import type { Id } from "../_generated/dataModel";

function canReadAllOrganizationCampuses(
  access: Awaited<ReturnType<typeof requireOrganizationAccess>>,
) {
  return access.isPlatformAdmin || !!access.membership;
}

async function getCampusScopeOrganizationPerson(
  ctx: QueryCtx,
  args: {
    access: Awaited<ReturnType<typeof requireOrganizationAccess>>;
    organizationPersonId?: Id<"organizationPeople">;
  },
) {
  const actorOrganizationPerson = args.access.organizationPerson;
  if (!actorOrganizationPerson?.isActive) {
    return null;
  }

  if (!args.organizationPersonId) {
    return actorOrganizationPerson;
  }

  const targetOrganizationPerson = await ctx.db.get(args.organizationPersonId);
  if (
    !targetOrganizationPerson?.isActive ||
    targetOrganizationPerson.organizationId !== args.access.organization._id
  ) {
    return null;
  }

  if (targetOrganizationPerson._id === actorOrganizationPerson._id) {
    return targetOrganizationPerson;
  }

  const guardianRelationship =
    await getGuardianRelationshipForGuardianAndStudent(ctx, {
      organizationId: args.access.organization._id,
      guardianOrganizationPersonId: actorOrganizationPerson._id,
      studentOrganizationPersonId: targetOrganizationPerson._id,
    });

  return guardianRelationship ? targetOrganizationPerson : null;
}

export const listForOrganization = query({
  args: {
    slug: v.string(),
    organizationPersonId: v.optional(v.id("organizationPeople")),
  },
  returns: v.array(campusValidator),
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccess(ctx, args.slug);
    if (!canReadAllOrganizationCampuses(access)) {
      const organizationPerson = await getCampusScopeOrganizationPerson(ctx, {
        access,
        organizationPersonId: args.organizationPersonId,
      });
      if (!organizationPerson) {
        return [];
      }

      const assignments =
        await listActiveCampusAssignmentsForOrganizationPerson(ctx, {
          organizationId: access.organization._id,
          organizationPersonId: organizationPerson._id,
        });
      const campuses = (
        await Promise.all(
          assignments.map((assignment) => ctx.db.get(assignment.campusId)),
        )
      ).filter(
        (campus): campus is NonNullable<typeof campus> =>
          !!campus &&
          campus.isActive &&
          campus.organizationId === access.organization._id,
      );

      return await Promise.all(
        campuses.map((campus) => buildCampusResponse(ctx, campus)),
      );
    }

    const campuses = await ctx.db
      .query("campuses")
      .withIndex("by_organization_id_and_name", (query) =>
        query.eq("organizationId", access.organization._id),
      )
      .take(50);

    return await Promise.all(
      campuses.map((campus) => buildCampusResponse(ctx, campus)),
    );
  },
});

export const getBySlug = query({
  args: {
    slug: v.string(),
    campusSlug: v.string(),
    organizationPersonId: v.optional(v.id("organizationPeople")),
  },
  returns: v.union(campusValidator, v.null()),
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccess(ctx, args.slug);
    const campus = await getCampusBySlug(ctx, {
      organizationId: access.organization._id,
      slug: args.campusSlug,
    });

    if (!campus || !campus.isActive) {
      return null;
    }

    if (!canReadAllOrganizationCampuses(access)) {
      const organizationPerson = await getCampusScopeOrganizationPerson(ctx, {
        access,
        organizationPersonId: args.organizationPersonId,
      });
      if (!organizationPerson) {
        return null;
      }

      const assignments =
        await listActiveCampusAssignmentsForOrganizationPerson(ctx, {
          organizationId: access.organization._id,
          organizationPersonId: organizationPerson._id,
        });
      const hasCampusAssignment = assignments.some(
        (assignment) => assignment.campusId === campus._id,
      );
      if (!hasCampusAssignment) {
        return null;
      }
    }

    return await buildCampusResponse(ctx, campus);
  },
});

export const createForOrganization = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  returns: campusValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const campus = await createCampus(ctx, {
      organizationId: access.organization._id,
      name: args.name,
      imageStorageId: args.imageStorageId,
    });

    return await buildCampusResponse(ctx, campus);
  },
});

export const setActiveForOrganization = mutation({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
    isActive: v.boolean(),
  },
  returns: campusValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const campus = await requireCampusInOrganization(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
    });

    if (campus.isActive === args.isActive) {
      return await buildCampusResponse(ctx, campus);
    }

    await ctx.db.patch("campuses", campus._id, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    const updatedCampus = await ctx.db.get(campus._id);
    if (!updatedCampus) {
      throwAppError("CAMPUS_UPDATE_FAILED");
    }

    return await buildCampusResponse(ctx, updatedCampus);
  },
});

export const generateImageUploadUrl = mutation({
  args: {
    slug: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    return await ctx.storage.generateUploadUrl();
  },
});

export const discardImageUpload = mutation({
  args: {
    slug: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    await deleteStoredImageIfPresent(ctx, args.storageId);
    return null;
  },
});
