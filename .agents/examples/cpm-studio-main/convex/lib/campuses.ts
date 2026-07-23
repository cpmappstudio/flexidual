import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeTenantSlug } from "../../lib/tenancy/slug";
import { throwAppError } from "./errors";
import { deleteStoredImageIfPresent, validateStoredImageFile } from "./images";
import { requireOrganizationById } from "./organizations";

type Context = QueryCtx | MutationCtx;
type CampusDoc = Doc<"campuses">;
const CAMPUS_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseCampusSlug(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const slug = normalizeTenantSlug(value);
  return CAMPUS_SLUG_PATTERN.test(slug) ? slug : null;
}

export async function getCampusBySlug(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    slug: string;
  },
) {
  const campusSlug = parseCampusSlug(args.slug);
  if (!campusSlug) {
    return null;
  }

  return await ctx.db
    .query("campuses")
    .withIndex("by_organization_id_and_slug", (query) =>
      query.eq("organizationId", args.organizationId).eq("slug", campusSlug),
    )
    .unique();
}

export async function requireCampusInOrganization(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
  },
) {
  const campus = await ctx.db.get("campuses", args.campusId);
  if (!campus) {
    throwAppError("CAMPUS_NOT_FOUND");
  }

  if (campus.organizationId !== args.organizationId) {
    throwAppError("CAMPUS_SCOPE_MISMATCH");
  }

  return campus;
}

export async function getEffectiveCampusImageUrl(
  ctx: Context,
  campus: Pick<CampusDoc, "imageStorageId">,
) {
  if (!campus.imageStorageId) {
    return null;
  }

  const storedImageUrl = await ctx.storage.getUrl(campus.imageStorageId);
  return storedImageUrl ?? null;
}

export async function buildCampusResponse(ctx: Context, campus: CampusDoc) {
  const imageUrl = await getEffectiveCampusImageUrl(ctx, campus);

  return {
    _id: campus._id,
    _creationTime: campus._creationTime,
    organizationId: campus.organizationId,
    name: campus.name,
    slug: campus.slug,
    imageUrl: imageUrl ?? undefined,
    isActive: campus.isActive,
    createdAt: campus.createdAt,
    updatedAt: campus.updatedAt,
  };
}

export async function createCampus(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    name: string;
    imageStorageId?: Id<"_storage">;
  },
) {
  await requireOrganizationById(ctx, args.organizationId);

  const name = args.name.trim();
  if (!name) {
    throwAppError("CAMPUS_NAME_REQUIRED");
  }

  const baseSlug = normalizeTenantSlug(name);
  if (!baseSlug) {
    throwAppError("CAMPUS_NAME_INVALID");
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

  let slug: string | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate =
      attempt === 0 ? baseSlug : normalizeTenantSlug(`${baseSlug}-${attempt + 1}`);

    if (!candidate || parseCampusSlug(candidate) !== candidate) {
      continue;
    }

    const existingCampus = await getCampusBySlug(ctx, {
      organizationId: args.organizationId,
      slug: candidate,
    });
    if (!existingCampus) {
      slug = candidate;
      break;
    }
  }

  if (!slug) {
    throwAppError("CAMPUS_SLUG_UNAVAILABLE");
  }

  const now = Date.now();
  const campusId = await ctx.db.insert("campuses", {
    organizationId: args.organizationId,
    name,
    slug,
    imageStorageId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const campus = await ctx.db.get("campuses", campusId);
  if (!campus) {
    throwAppError("CAMPUS_CREATE_FAILED");
  }

  return campus;
}
