import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import {
  requireModuleCapability,
  requireOrganizationRole,
} from "../../../lib/authz";

type Context = QueryCtx | MutationCtx;

export async function requireLiveClassesAccess(ctx: Context, slug: string) {
  return await requireModuleCapability(ctx, slug, "liveClasses.core");
}

export async function requireLiveClassesAdmin(ctx: Context, slug: string) {
  const access = await requireOrganizationRole(ctx, {
    slug,
    minimumRole: "admin",
  });

  await requireModuleCapability(ctx, slug, "liveClasses.core");

  return access;
}
