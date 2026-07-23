import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  capabilitySources,
  getEnabledModuleKeysFromCapabilities,
  platformCapabilityRegistry,
  type CapabilitySource,
  type PlatformCapabilityKey,
} from "../../lib/platform/capabilities";
import { requireOrganizationById } from "./organizations";

type Context = QueryCtx | MutationCtx;
type OrganizationCapabilityDoc = Doc<"organizationCapabilities">;
const MAX_PLATFORM_CAPABILITIES = platformCapabilityRegistry.length;

export async function getOrganizationCapability(
  ctx: Context,
  organizationId: Id<"organizations">,
  capabilityKey: PlatformCapabilityKey,
) {
  return await ctx.db
    .query("organizationCapabilities")
    .withIndex("by_organization_id_and_capability_key", (query) =>
      query.eq("organizationId", organizationId).eq("capabilityKey", capabilityKey),
    )
    .unique();
}

export async function listOrganizationCapabilities(
  ctx: Context,
  organizationId: Id<"organizations">,
) {
  await requireOrganizationById(ctx, organizationId);

  return await ctx.db
    .query("organizationCapabilities")
    .withIndex("by_organization_id_and_updated_at", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(MAX_PLATFORM_CAPABILITIES);
}

export async function listEnabledOrganizationCapabilityKeys(
  ctx: Context,
  organizationId: Id<"organizations">,
) {
  await requireOrganizationById(ctx, organizationId);

  const capabilities = await ctx.db
    .query("organizationCapabilities")
    .withIndex("by_organization_id_and_enabled_and_updated_at", (query) =>
      query.eq("organizationId", organizationId).eq("enabled", true),
    )
    .take(MAX_PLATFORM_CAPABILITIES);

  return capabilities.map((capability) => capability.capabilityKey);
}

export async function upsertOrganizationCapability(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    capabilityKey: PlatformCapabilityKey;
    enabled: boolean;
    source: CapabilitySource;
  },
) {
  await requireOrganizationById(ctx, args.organizationId);

  const existingCapability = await getOrganizationCapability(
    ctx,
    args.organizationId,
    args.capabilityKey,
  );
  const now = Date.now();

  if (existingCapability) {
    await ctx.db.patch("organizationCapabilities", existingCapability._id, {
      enabled: args.enabled,
      source: args.source,
      updatedAt: now,
    });

    return await ctx.db.get(
      "organizationCapabilities",
      existingCapability._id,
    );
  }

  const capabilityId = await ctx.db.insert("organizationCapabilities", {
    organizationId: args.organizationId,
    capabilityKey: args.capabilityKey,
    enabled: args.enabled,
    source: args.source,
    createdAt: now,
    updatedAt: now,
  });

  return await ctx.db.get("organizationCapabilities", capabilityId);
}

export async function seedOrganizationCapabilities(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    capabilityKeys: readonly PlatformCapabilityKey[];
    source?: CapabilitySource;
  },
) {
  const uniqueCapabilityKeys = [...new Set(args.capabilityKeys)];

  for (const capabilityKey of uniqueCapabilityKeys) {
    await upsertOrganizationCapability(ctx, {
      organizationId: args.organizationId,
      capabilityKey,
      enabled: true,
      source: args.source ?? "manual",
    });
  }
}

export function buildOrganizationCapabilityRegistryState(
  args: {
    capabilities: readonly OrganizationCapabilityDoc[];
  },
) {
  return platformCapabilityRegistry.map((capability) => {
    const currentState =
      args.capabilities.find((item) => item.capabilityKey === capability.key) ?? null;

    return {
      key: capability.key,
      moduleKey: capability.moduleKey,
      name: capability.name,
      description: capability.description,
      enabled: currentState?.enabled ?? false,
      source: currentState?.source ?? null,
    };
  });
}

export function getCapabilitySourceOrNull(source: string | null | undefined) {
  if (!source) {
    return null;
  }

  return capabilitySources.includes(source as CapabilitySource)
    ? (source as CapabilitySource)
    : null;
}

export function buildResolvedWorkspaceCapabilities(
  capabilityKeys: readonly PlatformCapabilityKey[],
) {
  const enabledCapabilityKeys = [...new Set(capabilityKeys)];
  const enabledModuleKeys = getEnabledModuleKeysFromCapabilities(enabledCapabilityKeys);

  return {
    enabledCapabilityKeys,
    enabledModuleKeys,
  };
}

export async function deleteOrganizationCapabilityBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const capabilities = await ctx.db
    .query("organizationCapabilities")
    .withIndex("by_organization_id_and_updated_at", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const capability of capabilities) {
    await ctx.db.delete("organizationCapabilities", capability._id);
  }

  return capabilities.length;
}
