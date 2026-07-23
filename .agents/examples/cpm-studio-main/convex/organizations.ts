import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internal } from "./_generated/api";
import {
  imageChangeValidator,
  organizationAccessValidator,
  capabilityKeyValidator,
  organizationRoleValidator,
  organizationMembershipValidator,
  organizationValidator,
} from "./lib/validators";
import {
  buildOrganizationResponse,
  buildOrganizationSummaryResponse,
  createOrganization,
  deleteOrganizationDependentRowsBatch,
  deleteOrganizationRecord,
  getOrganizationBySlug,
  getOrganizationMembership,
  requireDeletableOrganization,
  updateOrganizationProfile,
  upsertOrganizationMembership,
} from "./lib/organizations";
import { deleteStoredImageIfPresent } from "./lib/images";
import {
  ORGANIZATION_DELETION_BATCH_SIZE,
  clampPaginationOpts,
} from "./lib/queryLimits";
import { requireCurrentUserId } from "./lib/auth";
import {
  getCurrentOrganizationAccess,
  requireOrganizationRole,
  requirePlatformMember,
  requirePlatformSuperadmin,
} from "./lib/authz";
import { throwAppError } from "./lib/errors";

const organizationSummaryValidator = v.object({
  _id: v.id("organizations"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
});

const platformOrganizationValidator = v.object({
  _id: v.id("organizations"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// Returns the user's default organization if it exists and is active.
// Backed by `users.defaultOrganizationId`, which is maintained by the
// membership write path (set on first membership, reassigned on removal).
// Constant cost: 1 user fetch + 1 org fetch + 1 membership fetch.
export const getFirstMine = query({
  args: {},
  returns: v.union(organizationSummaryValidator, v.null()),
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user?.defaultOrganizationId) {
      return null;
    }

    const organization = await ctx.db.get(
      "organizations",
      user.defaultOrganizationId,
    );
    if (!organization || !organization.isActive) {
      return null;
    }

    const membership = await getOrganizationMembership(
      ctx,
      userId,
      organization._id,
    );
    if (!membership) {
      return null;
    }

    return await buildOrganizationSummaryResponse(
      ctx,
      organization,
      membership.role,
    );
  },
});

export const getAccessibleBySlug = query({
  args: { slug: v.string() },
  returns: v.union(organizationAccessValidator, v.null()),
  handler: async (ctx, args) => {
    const access = await getCurrentOrganizationAccess(ctx, args.slug);
    if (!access) {
      return null;
    }

    return {
      organization: await buildOrganizationResponse(ctx, access.organization),
      membership: access.membership,
      effectiveRole: access.effectiveRole,
      isPlatformAdmin: access.isPlatformAdmin,
    };
  },
});

export const listAccessible = query({
  args: {},
  returns: v.array(platformOrganizationValidator),
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const user = await ctx.db.get("users", userId);

    const organizations = user?.hasPlatformAccess
      ? await ctx.db.query("organizations").withIndex("by_name").take(50)
      : await (async () => {
          const memberships = await ctx.db
            .query("organizationMemberships")
            .withIndex("by_user_id_and_organization_id", (query) =>
              query.eq("userId", userId),
            )
            .take(50);

          return (
            await Promise.all(
              memberships.map((membership) =>
                ctx.db.get("organizations", membership.organizationId),
              ),
            )
          ).filter(
            (organization): organization is NonNullable<typeof organization> =>
              !!organization,
          );
        })();

    return await Promise.all(
      organizations
        .filter((organization) => organization.isActive)
        .map((organization) => buildOrganizationResponse(ctx, organization)),
    );
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(organizationValidator, v.null()),
  handler: async (ctx, args) => {
    const organization = await getOrganizationBySlug(ctx, args.slug);

    if (!organization || !organization.isActive) {
      return null;
    }

    return await buildOrganizationResponse(ctx, organization);
  },
});

export const listForPlatform = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(platformOrganizationValidator),
  handler: async (ctx, args) => {
    await requirePlatformMember(ctx);

    const result = await ctx.db
      .query("organizations")
      .withIndex("by_name")
      .paginate(clampPaginationOpts(args.paginationOpts));

    return {
      ...result,
      page: await Promise.all(
        result.page.map((organization) =>
          buildOrganizationResponse(ctx, organization),
        ),
      ),
    };
  },
});

export const createForPlatform = mutation({
  args: {
    name: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    capabilityKeys: v.optional(v.array(capabilityKeyValidator)),
  },
  returns: organizationValidator,
  handler: async (ctx, args) => {
    const platformAdmin = await requirePlatformSuperadmin(ctx);

    return await createOrganization(ctx, {
      name: args.name,
      ownerUserId: platformAdmin._id,
      imageStorageId: args.imageStorageId,
      capabilityKeys: args.capabilityKeys,
    });
  },
});

export const generateImageUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requirePlatformSuperadmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const discardImageUpload = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePlatformSuperadmin(ctx);
    await deleteStoredImageIfPresent(ctx, args.storageId);
    return null;
  },
});

export const generateTenantImageUploadUrl = mutation({
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

export const discardTenantImageUpload = mutation({
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

export const updateForOrganization = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    imageChange: imageChangeValidator,
  },
  returns: organizationValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const requestedName = args.name.trim();
    const isNameChange = requestedName !== access.organization.name;

    if (isNameChange && access.effectiveRole !== "owner") {
      throwAppError("UNAUTHORIZED");
    }

    return await updateOrganizationProfile(ctx, {
      organizationId: access.organization._id,
      name: args.name,
      imageChange: args.imageChange,
    });
  },
});

export const deactivateForOrganization = mutation({
  args: {
    slug: v.string(),
  },
  returns: organizationValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "owner",
    });

    await ctx.db.patch("organizations", access.organization._id, {
      isActive: false,
      updatedAt: Date.now(),
    });

    const updatedOrganization = await ctx.db.get(access.organization._id);
    if (!updatedOrganization) {
      throwAppError("ORGANIZATION_UPDATE_FAILED");
    }

    return await buildOrganizationResponse(ctx, updatedOrganization);
  },
});

export const setActiveForPlatform = mutation({
  args: {
    organizationId: v.id("organizations"),
    isActive: v.boolean(),
  },
  returns: organizationValidator,
  handler: async (ctx, args) => {
    await requirePlatformSuperadmin(ctx);

    const organization = await ctx.db.get("organizations", args.organizationId);
    if (!organization) {
      throwAppError("ORGANIZATION_NOT_FOUND");
    }

    const updatedAt = Date.now();
    await ctx.db.patch("organizations", args.organizationId, {
      isActive: args.isActive,
      updatedAt,
    });

    const updatedOrganization = await ctx.db.get(
      "organizations",
      args.organizationId,
    );
    if (!updatedOrganization) {
      throwAppError("ORGANIZATION_UPDATE_FAILED");
    }

    return await buildOrganizationResponse(ctx, updatedOrganization);
  },
});

export const deleteForPlatform = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePlatformSuperadmin(ctx);

    const organization = await requireDeletableOrganization(
      ctx,
      args.organizationId,
    );

    if (organization.isActive) {
      await ctx.db.patch("organizations", organization._id, {
        isActive: false,
        updatedAt: Date.now(),
      });
    }

    const deletedCounts = await deleteOrganizationDependentRowsBatch(
      ctx,
      organization._id,
      ORGANIZATION_DELETION_BATCH_SIZE,
    );

    if (
      Object.values(deletedCounts).some(
        (deletedCount) => deletedCount === ORGANIZATION_DELETION_BATCH_SIZE,
      )
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.organizations.deleteForPlatformInternal,
        {
          organizationId: organization._id,
        },
      );
      return null;
    }

    await deleteOrganizationRecord(ctx, organization._id);
    return null;
  },
});

// All organization membership writes should go through this mutation to keep
// the user+organization uniqueness invariant in one place.
export const upsertMembership = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: organizationRoleValidator,
  },
  returns: organizationMembershipValidator,
  handler: async (ctx, args) => {
    return await upsertOrganizationMembership(ctx, args);
  },
});

export const deleteForPlatformInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get("organizations", args.organizationId);
    if (!organization) {
      return null;
    }

    const deletedCounts = await deleteOrganizationDependentRowsBatch(
      ctx,
      organization._id,
      ORGANIZATION_DELETION_BATCH_SIZE,
    );

    if (
      Object.values(deletedCounts).some(
        (deletedCount) => deletedCount === ORGANIZATION_DELETION_BATCH_SIZE,
      )
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.organizations.deleteForPlatformInternal,
        args,
      );
      return null;
    }

    await deleteOrganizationRecord(ctx, organization._id);
    return null;
  },
});
