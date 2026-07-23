import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { normalizeTenantSlug, parseTenantSlug } from "../../lib/tenancy/slug";
import type { PlatformCapabilityKey } from "../../lib/platform/capabilities";
import {
  deleteOrganizationCapabilityBatch,
  seedOrganizationCapabilities,
} from "./capabilities";
import {
  deleteOrganizationPersonActivityDayBatch,
  deleteOrganizationUserActivityDayBatch,
} from "./activity";
import { throwAppError } from "./errors";
import { ORGANIZATION_DELETION_BATCH_SIZE } from "./queryLimits";
import { deleteBusinessModuleRowsBatch } from "../modules/delete";
import {
  getUserByPersonId,
  reassignUserDefaultOrganizationIfMatches,
  requireUserById,
  setUserDefaultOrganizationIfMissing,
} from "./users";
import { deleteStoredImageIfPresent, validateStoredImageFile } from "./images";
import {
  deleteOrganizationPersonPinsForOrganizationBatch,
  deleteOrganizationPersonProfileUnlocksForOrganizationBatch,
} from "./profilePins";

type Context = QueryCtx | MutationCtx;
type OrganizationDoc = Doc<"organizations">;
type OrganizationMembership = Doc<"organizationMemberships">;
type OrganizationRole = OrganizationMembership["role"];
type ImageChange =
  | { kind: "keep" }
  | { kind: "set"; storageId: Id<"_storage"> }
  | { kind: "remove" };

export async function getOrganizationBySlug(ctx: Context, slug: string) {
  const tenantSlug = parseTenantSlug(slug);
  if (!tenantSlug) {
    return null;
  }

  return await ctx.db
    .query("organizations")
    .withIndex("by_slug", (query) => query.eq("slug", tenantSlug))
    .unique();
}

export async function getOrganizationMembership(
  ctx: Context,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
) {
  return await ctx.db
    .query("organizationMemberships")
    .withIndex("by_user_id_and_organization_id", (query) =>
      query.eq("userId", userId).eq("organizationId", organizationId),
    )
    .unique();
}

export async function requireOrganizationById(
  ctx: Context,
  organizationId: Id<"organizations">,
) {
  const organization = await ctx.db.get("organizations", organizationId);
  if (!organization) {
    throwAppError("ORGANIZATION_NOT_FOUND");
  }

  return organization;
}

export async function getEffectiveOrganizationImageUrl(
  ctx: Context,
  organization: Pick<OrganizationDoc, "imageStorageId">,
) {
  if (organization.imageStorageId) {
    const storedImageUrl = await ctx.storage.getUrl(
      organization.imageStorageId,
    );
    if (storedImageUrl) {
      return storedImageUrl;
    }
  }

  return null;
}

export async function buildOrganizationResponse(
  ctx: Context,
  organization: OrganizationDoc,
) {
  const imageUrl = await getEffectiveOrganizationImageUrl(ctx, organization);

  return {
    _id: organization._id,
    _creationTime: organization._creationTime,
    name: organization.name,
    slug: organization.slug,
    imageUrl: imageUrl ?? undefined,
    isActive: organization.isActive,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

export async function buildOrganizationSummaryResponse(
  ctx: Context,
  organization: OrganizationDoc,
  role: OrganizationRole,
) {
  return {
    ...(await buildOrganizationResponse(ctx, organization)),
    role,
  };
}

export async function upsertOrganizationMembership(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    role: OrganizationRole;
  },
) {
  await requireOrganizationById(ctx, args.organizationId);
  await requireUserById(ctx, args.userId);

  const existingMembership = await getOrganizationMembership(
    ctx,
    args.userId,
    args.organizationId,
  );
  const now = Date.now();

  if (existingMembership) {
    const nextMembership = {
      ...existingMembership,
      role: args.role,
      updatedAt: now,
    };

    await ctx.db.patch("organizationMemberships", existingMembership._id, {
      role: nextMembership.role,
      updatedAt: nextMembership.updatedAt,
    });

    return nextMembership;
  }

  const membershipId = await ctx.db.insert("organizationMemberships", {
    organizationId: args.organizationId,
    userId: args.userId,
    role: args.role,
    createdAt: now,
    updatedAt: now,
  });
  const membership = await ctx.db.get("organizationMemberships", membershipId);

  if (!membership) {
    throwAppError("ORGANIZATION_MEMBERSHIP_CREATE_FAILED");
  }

  await setUserDefaultOrganizationIfMissing(
    ctx,
    args.userId,
    args.organizationId,
  );

  return membership;
}

export async function createOrganization(
  ctx: MutationCtx,
  args: {
    name: string;
    ownerUserId: Id<"users">;
    imageStorageId?: Id<"_storage">;
    capabilityKeys?: readonly PlatformCapabilityKey[];
  },
) {
  const name = args.name.trim();
  if (!name) {
    throwAppError("ORGANIZATION_NAME_REQUIRED");
  }

  const baseSlug = normalizeTenantSlug(name);
  if (!baseSlug) {
    throwAppError("ORGANIZATION_NAME_INVALID");
  }

  let slug: string | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate =
      attempt === 0
        ? baseSlug
        : normalizeTenantSlug(`${baseSlug}-${attempt + 1}`);

    if (!candidate || parseTenantSlug(candidate) !== candidate) {
      continue;
    }

    const existingOrganization = await getOrganizationBySlug(ctx, candidate);
    if (!existingOrganization) {
      slug = candidate;
      break;
    }
  }

  if (!slug) {
    throwAppError("ORGANIZATION_SLUG_UNAVAILABLE");
  }

  const imageStorageId = args.imageStorageId;
  if (imageStorageId) {
    try {
      await validateStoredImageFile(ctx, imageStorageId);
    } catch (error) {
      await deleteStoredImageIfPresent(ctx, imageStorageId);
      throw error;
    }
  }
  const now = Date.now();
  const organizationId = await ctx.db.insert("organizations", {
    name,
    slug,
    imageStorageId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const organization = await ctx.db.get("organizations", organizationId);

  if (!organization) {
    throwAppError("ORGANIZATION_CREATE_FAILED");
  }

  try {
    if (args.capabilityKeys?.length) {
      await seedOrganizationCapabilities(ctx, {
        organizationId,
        capabilityKeys: args.capabilityKeys,
      });
    }

    await upsertOrganizationMembership(ctx, {
      organizationId,
      userId: args.ownerUserId,
      role: "owner",
    });
  } catch (error) {
    await deleteOrganizationRecord(ctx, organizationId);
    throw error;
  }

  return await buildOrganizationResponse(ctx, organization);
}

export async function updateOrganizationProfile(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    name: string;
    imageChange: ImageChange;
  },
) {
  const organization = await requireOrganizationById(ctx, args.organizationId);
  const name = args.name.trim();
  if (!name) {
    throwAppError("ORGANIZATION_NAME_REQUIRED");
  }

  const slug = normalizeTenantSlug(name);
  if (!slug || parseTenantSlug(slug) !== slug) {
    throwAppError("ORGANIZATION_NAME_INVALID");
  }

  if (slug !== organization.slug) {
    const existingOrganization = await getOrganizationBySlug(ctx, slug);
    if (existingOrganization && existingOrganization._id !== organization._id) {
      throwAppError("ORGANIZATION_SLUG_UNAVAILABLE");
    }
  }

  let nextImageStorageId = organization.imageStorageId;
  if (args.imageChange.kind === "set") {
    try {
      await validateStoredImageFile(ctx, args.imageChange.storageId);
    } catch (error) {
      await deleteStoredImageIfPresent(ctx, args.imageChange.storageId);
      throw error;
    }

    nextImageStorageId = args.imageChange.storageId;
  } else if (args.imageChange.kind === "remove") {
    nextImageStorageId = undefined;
  }

  await ctx.db.patch("organizations", organization._id, {
    name,
    slug,
    imageStorageId: nextImageStorageId,
    updatedAt: Date.now(),
  });

  if (
    args.imageChange.kind === "set" &&
    organization.imageStorageId &&
    organization.imageStorageId !== args.imageChange.storageId
  ) {
    await deleteStoredImageIfPresent(ctx, organization.imageStorageId);
  } else if (
    args.imageChange.kind === "remove" &&
    organization.imageStorageId
  ) {
    await deleteStoredImageIfPresent(ctx, organization.imageStorageId);
  }

  const updatedOrganization = await ctx.db.get(
    "organizations",
    organization._id,
  );
  if (!updatedOrganization) {
    throwAppError("ORGANIZATION_UPDATE_FAILED");
  }

  return await buildOrganizationResponse(ctx, updatedOrganization);
}

export async function requireDeletableOrganization(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
) {
  const organization = await ctx.db.get("organizations", organizationId);
  if (!organization) {
    throwAppError("ORGANIZATION_NOT_FOUND");
  }

  return organization;
}

export async function deleteOrganizationMembershipBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_id", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const membership of memberships) {
    await ctx.db.delete("organizationMemberships", membership._id);
    await reassignUserDefaultOrganizationIfMatches(
      ctx,
      membership.userId,
      organizationId,
    );
  }

  return memberships.length;
}

export async function deleteOrganizationInvitationBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const invitations = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_org_id_and_status_and_created_at", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const invitation of invitations) {
    await ctx.db.delete("organizationInvitations", invitation._id);
  }

  return invitations.length;
}

export async function deleteOrganizationPersonRoleBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const organizationPersonRoles = await ctx.db
    .query("organizationPersonRoles")
    .withIndex("by_organization_id_and_role", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const organizationPersonRole of organizationPersonRoles) {
    await ctx.db.delete("organizationPersonRoles", organizationPersonRole._id);
  }

  return organizationPersonRoles.length;
}

export async function deleteGuardianRelationshipBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const guardianRelationships = await ctx.db
    .query("guardianRelationships")
    // Prefix lookup on the 4-field index (only the leading organizationId
    // field is constrained), so no separate by_organization_id index is
    // needed.
    .withIndex(
      "by_org_id_and_guardian_op_id_and_student_op_id_and_type",
      (query) => query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const guardianRelationship of guardianRelationships) {
    await ctx.db.delete("guardianRelationships", guardianRelationship._id);
  }

  return guardianRelationships.length;
}

export async function deleteOrganizationPersonCampusAssignmentBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const assignments = await ctx.db
    .query("organizationPersonCampusAssignments")
    .withIndex("by_org_id_and_op_id_and_is_active", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const assignment of assignments) {
    await ctx.db.delete("organizationPersonCampusAssignments", assignment._id);
  }

  return assignments.length;
}

export async function deleteOrganizationPersonPinBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  return await deleteOrganizationPersonPinsForOrganizationBatch(
    ctx,
    organizationId,
    batchSize,
  );
}

export async function deleteOrganizationPersonProfileUnlockBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  return await deleteOrganizationPersonProfileUnlocksForOrganizationBatch(
    ctx,
    organizationId,
    batchSize,
  );
}

export async function deleteOrganizationPeopleBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const organizationPeople = await ctx.db
    .query("organizationPeople")
    // Prefix lookup on by_organization_id_and_person_id (only the leading
    // organizationId is constrained); a standalone by_organization_id index
    // would be redundant.
    .withIndex("by_organization_id_and_person_id", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const organizationPerson of organizationPeople) {
    const [person, linkedUser, organizationPeopleForPerson] = await Promise.all(
      [
        ctx.db.get("people", organizationPerson.personId),
        getUserByPersonId(ctx, organizationPerson.personId),
        ctx.db
          .query("organizationPeople")
          .withIndex("by_person_id", (query) =>
            query.eq("personId", organizationPerson.personId),
          )
          .take(2),
      ],
    );

    await ctx.db.delete("organizationPeople", organizationPerson._id);

    const isOnlyOrganizationProfileForPerson =
      organizationPeopleForPerson.length === 1 &&
      organizationPeopleForPerson[0]._id === organizationPerson._id;

    if (person && !linkedUser && isOnlyOrganizationProfileForPerson) {
      await deleteStoredImageIfPresent(ctx, person.imageStorageId);
      await ctx.db.delete("people", person._id);
    }
  }

  return organizationPeople.length;
}

export async function deleteCampusGradeOfferingBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const offerings = await ctx.db
    .query("campusGradeOfferings")
    .withIndex("by_organization_id_and_campus_id_and_grade_level_id", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const offering of offerings) {
    await ctx.db.delete("campusGradeOfferings", offering._id);
  }

  return offerings.length;
}

export async function deleteAcademicGradeLevelBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const gradeLevels = await ctx.db
    .query("academicGradeLevels")
    .withIndex("by_organization_id_and_sort_order", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const gradeLevel of gradeLevels) {
    await ctx.db.delete("academicGradeLevels", gradeLevel._id);
  }

  return gradeLevels.length;
}

export async function deleteCampusBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const campuses = await ctx.db
    .query("campuses")
    .withIndex("by_organization_id_and_name", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const campus of campuses) {
    await deleteStoredImageIfPresent(ctx, campus.imageStorageId);
    await ctx.db.delete("campuses", campus._id);
  }

  return campuses.length;
}

export async function deleteOrganizationDependentRowsBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize = ORGANIZATION_DELETION_BATCH_SIZE,
) {
  const deletedModuleCounts = await deleteBusinessModuleRowsBatch(
    ctx,
    organizationId,
    batchSize,
  );
  const deletedOrganizationUserActivityDayCount =
    await deleteOrganizationUserActivityDayBatch(
      ctx,
      organizationId,
      batchSize,
    );
  const deletedOrganizationPersonActivityDayCount =
    await deleteOrganizationPersonActivityDayBatch(
      ctx,
      organizationId,
      batchSize,
    );
  const deletedMembershipCount = await deleteOrganizationMembershipBatch(
    ctx,
    organizationId,
    batchSize,
  );
  const deletedOrganizationInvitationCount =
    await deleteOrganizationInvitationBatch(ctx, organizationId, batchSize);
  const deletedOrganizationPersonRoleCount =
    await deleteOrganizationPersonRoleBatch(ctx, organizationId, batchSize);
  const deletedGuardianRelationshipCount =
    await deleteGuardianRelationshipBatch(ctx, organizationId, batchSize);
  const deletedOrganizationPersonCampusAssignmentCount =
    await deleteOrganizationPersonCampusAssignmentBatch(
      ctx,
      organizationId,
      batchSize,
    );
  const deletedOrganizationPersonPinCount =
    await deleteOrganizationPersonPinBatch(ctx, organizationId, batchSize);
  const deletedOrganizationPersonProfileUnlockCount =
    await deleteOrganizationPersonProfileUnlockBatch(
      ctx,
      organizationId,
      batchSize,
    );
  const deletedOrganizationPeopleCount = await deleteOrganizationPeopleBatch(
    ctx,
    organizationId,
    batchSize,
  );
  const deletedCampusGradeOfferingCount = await deleteCampusGradeOfferingBatch(
    ctx,
    organizationId,
    batchSize,
  );
  const deletedAcademicGradeLevelCount = await deleteAcademicGradeLevelBatch(
    ctx,
    organizationId,
    batchSize,
  );
  const deletedCampusCount = await deleteCampusBatch(
    ctx,
    organizationId,
    batchSize,
  );
  const deletedCapabilityCount = await deleteOrganizationCapabilityBatch(
    ctx,
    organizationId,
    batchSize,
  );

  return {
    ...deletedModuleCounts,
    deletedOrganizationUserActivityDayCount,
    deletedOrganizationPersonActivityDayCount,
    deletedMembershipCount,
    deletedOrganizationInvitationCount,
    deletedOrganizationPersonRoleCount,
    deletedGuardianRelationshipCount,
    deletedOrganizationPersonCampusAssignmentCount,
    deletedOrganizationPersonPinCount,
    deletedOrganizationPersonProfileUnlockCount,
    deletedOrganizationPeopleCount,
    deletedCampusGradeOfferingCount,
    deletedAcademicGradeLevelCount,
    deletedCampusCount,
    deletedCapabilityCount,
  };
}

export async function deleteOrganizationRecord(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
) {
  const organization = await ctx.db.get("organizations", organizationId);
  if (organization?.imageStorageId) {
    await deleteStoredImageIfPresent(ctx, organization.imageStorageId);
  }

  await ctx.db.delete("organizations", organizationId);
}
