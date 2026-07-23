import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requirePlatformMember, requirePlatformSuperadmin } from "../lib/authz";
import {
  capabilityKeyValidator,
  capabilityRegistryEntryValidator,
  capabilitySourceValidator,
} from "../lib/validators";
import {
  buildOrganizationCapabilityRegistryState,
  listOrganizationCapabilities,
  upsertOrganizationCapability,
} from "../lib/capabilities";

export const listRegistryForOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.array(capabilityRegistryEntryValidator),
  handler: async (ctx, args) => {
    await requirePlatformMember(ctx);
    const capabilities = await listOrganizationCapabilities(
      ctx,
      args.organizationId,
    );

    return buildOrganizationCapabilityRegistryState({ capabilities });
  },
});

export const setForOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    capabilityKey: capabilityKeyValidator,
    enabled: v.boolean(),
    source: v.optional(capabilitySourceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePlatformSuperadmin(ctx);

    await upsertOrganizationCapability(ctx, {
      organizationId: args.organizationId,
      capabilityKey: args.capabilityKey,
      enabled: args.enabled,
      source: args.source ?? "manual",
    });

    return null;
  },
});

export const setManyForOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    entries: v.array(
      v.object({
        capabilityKey: capabilityKeyValidator,
        enabled: v.boolean(),
        source: v.optional(capabilitySourceValidator),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePlatformSuperadmin(ctx);

    for (const entry of args.entries) {
      await upsertOrganizationCapability(ctx, {
        organizationId: args.organizationId,
        capabilityKey: entry.capabilityKey,
        enabled: entry.enabled,
        source: entry.source ?? "manual",
      });
    }

    return null;
  },
});
