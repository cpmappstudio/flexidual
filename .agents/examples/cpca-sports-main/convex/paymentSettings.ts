import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgAccess, requireOrgAdmin } from "./lib/permissions";

const organizationPaymentSettingsValidator = v.object({
  wireTransferEnabled: v.boolean(),
  wireTransferThresholdCents: v.union(v.number(), v.null()),
  wireTransferPdfFileName: v.optional(v.string()),
  wireTransferPdfUrl: v.union(v.string(), v.null()),
  hasCustomWireTransferPdf: v.boolean(),
});

/**
 * Get payment settings for an organization.
 * Accessible to any authenticated user with organization access.
 */
export const getByOrganizationSlug = query({
  args: { organizationSlug: v.string() },
  returns: organizationPaymentSettingsValidator,
  handler: async (ctx, args) => {
    const { organization } = await requireOrgAccess(ctx, args.organizationSlug);

    const settings = await ctx.db
      .query("organizationPaymentSettings")
      .withIndex("byOrganization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .unique();

    if (!settings) {
      return {
        wireTransferEnabled: false,
        wireTransferThresholdCents: null,
        wireTransferPdfUrl: null,
        hasCustomWireTransferPdf: false,
      };
    }

    const wireTransferPdfUrl = settings.wireTransferPdfStorageId
      ? await ctx.storage.getUrl(settings.wireTransferPdfStorageId)
      : null;

    return {
      wireTransferEnabled: settings.wireTransferEnabled,
      wireTransferThresholdCents: settings.wireTransferThresholdCents ?? null,
      wireTransferPdfFileName: settings.wireTransferPdfFileName,
      wireTransferPdfUrl,
      hasCustomWireTransferPdf: Boolean(settings.wireTransferPdfStorageId),
    };
  },
});

/**
 * Update payment settings for an organization.
 * Admin/superadmin only.
 */
export const upsertByOrganizationSlug = mutation({
  args: {
    organizationSlug: v.string(),
    wireTransferEnabled: v.boolean(),
    wireTransferThresholdCents: v.optional(v.number()),
    wireTransferPdfStorageId: v.optional(v.id("_storage")),
    wireTransferPdfFileName: v.optional(v.string()),
    wireTransferPdfContentType: v.optional(v.string()),
    resetWireTransferPdf: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, organization } = await requireOrgAdmin(
      ctx,
      args.organizationSlug,
    );

    const threshold = args.wireTransferThresholdCents;
    if (
      args.wireTransferEnabled &&
      (!Number.isInteger(threshold) || (threshold ?? 0) <= 0)
    ) {
      throw new Error("Wire transfer threshold must be greater than 0");
    }

    const existing = await ctx.db
      .query("organizationPaymentSettings")
      .withIndex("byOrganization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .unique();

    let wireTransferPdfStorageId = existing?.wireTransferPdfStorageId;
    let wireTransferPdfFileName = existing?.wireTransferPdfFileName;
    let wireTransferPdfContentType = existing?.wireTransferPdfContentType;

    if (args.resetWireTransferPdf && existing?.wireTransferPdfStorageId) {
      await ctx.storage.delete(existing.wireTransferPdfStorageId);
      wireTransferPdfStorageId = undefined;
      wireTransferPdfFileName = undefined;
      wireTransferPdfContentType = undefined;
    }

    if (args.wireTransferPdfStorageId) {
      if (
        existing?.wireTransferPdfStorageId &&
        existing.wireTransferPdfStorageId !== args.wireTransferPdfStorageId
      ) {
        await ctx.storage.delete(existing.wireTransferPdfStorageId);
      }

      wireTransferPdfStorageId = args.wireTransferPdfStorageId;
      wireTransferPdfFileName = args.wireTransferPdfFileName;
      wireTransferPdfContentType = args.wireTransferPdfContentType;
    }

    if (args.wireTransferEnabled && !wireTransferPdfStorageId) {
      throw new Error(
        "Wire transfer PDF is required when wire transfer is enabled",
      );
    }

    const payload = {
      organizationId: organization._id,
      wireTransferEnabled: args.wireTransferEnabled,
      wireTransferThresholdCents: args.wireTransferEnabled
        ? threshold
        : undefined,
      wireTransferPdfStorageId,
      wireTransferPdfFileName,
      wireTransferPdfContentType,
      updatedAt: Date.now(),
      updatedBy: user._id,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return null;
    }

    await ctx.db.insert("organizationPaymentSettings", payload);
    return null;
  },
});
