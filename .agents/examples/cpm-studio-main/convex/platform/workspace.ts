import { query } from "../_generated/server";
import { v } from "convex/values";
import {
  buildResolvedWorkspaceCapabilities,
  listEnabledOrganizationCapabilityKeys,
} from "../lib/capabilities";
import { getCurrentOrganizationAccess } from "../lib/authz";
import { buildOrganizationResponse } from "../lib/organizations";
import { organizationWorkspaceValidator } from "../lib/validators";

export const getCurrentTenantWorkspace = query({
  args: {
    slug: v.string(),
  },
  returns: v.union(organizationWorkspaceValidator, v.null()),
  handler: async (ctx, args) => {
    const access = await getCurrentOrganizationAccess(ctx, args.slug);
    if (!access) {
      return null;
    }

    const enabledCapabilityKeys = await listEnabledOrganizationCapabilityKeys(
      ctx,
      access.organization._id,
    );
    const resolvedCapabilities = buildResolvedWorkspaceCapabilities(
      enabledCapabilityKeys,
    );

    return {
      organization: await buildOrganizationResponse(ctx, access.organization),
      membership: access.membership,
      effectiveRole: access.effectiveRole,
      isPlatformAdmin: access.isPlatformAdmin,
      enabledCapabilityKeys: resolvedCapabilities.enabledCapabilityKeys,
      enabledModuleKeys: resolvedCapabilities.enabledModuleKeys,
    };
  },
});

