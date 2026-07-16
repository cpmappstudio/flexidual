import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";
import {
  clearTemplateDocumentConfigs,
  defaultDocumentConfigValidator,
  replaceTemplateDocumentConfigs,
} from "./lib/defaultDocuments";
import {
  clearTemplatePaymentConfigs,
  defaultPaymentConfigValidator,
  replaceTemplatePaymentConfigs,
} from "./lib/defaultPayments";
import {
  duplicateTemplateAsDraft,
  getNextTemplateVersion,
  templateSectionValidator,
} from "./lib/formTemplates";
import { hasOrgAdminAccess } from "./lib/permissions";

const templateValidator = v.object({
  _id: v.id("formTemplates"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  version: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  mode: v.optional(v.union(v.literal("base"), v.literal("custom"))),
  isArchived: v.optional(v.boolean()),
  formDefinition: v.optional(v.string()),
  sections: v.array(templateSectionValidator),
  isPublished: v.boolean(),
});

/**
 * Get the published form template for an organization.
 * Used by the preadmission form to render dynamic fields.
 */
export const getPublished = query({
  args: { organizationSlug: v.string() },
  returns: v.union(templateValidator, v.null()),
  handler: async (ctx, args) => {
    const organization = await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", args.organizationSlug))
      .unique();

    if (!organization) {
      return null;
    }

    const template = await ctx.db
      .query("formTemplates")
      .withIndex("byOrganization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .filter((q) => q.eq(q.field("isPublished"), true))
      .collect();

    return template.find((item) => item.isArchived !== true) ?? null;
  },
});

/**
 * Get all form templates for an organization (admin).
 */
export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  returns: v.array(templateValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const isAdmin = await hasOrgAdminAccess(ctx, user._id, args.organizationId);
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    const templates = await ctx.db
      .query("formTemplates")
      .withIndex("byOrganization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    return templates
      .filter((template) => template.isArchived !== true)
      .sort((a, b) => b._creationTime - a._creationTime);
  },
});

/**
 * Get a specific template by ID.
 */
export const getById = query({
  args: { templateId: v.id("formTemplates") },
  returns: v.union(templateValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const template = await ctx.db.get(args.templateId);

    if (!template) {
      return null;
    }

    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      template.organizationId,
    );
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    return template;
  },
});

/**
 * Create a new form template (admin only).
 */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    formDefinition: v.optional(v.string()),
    sections: v.array(templateSectionValidator),
  },
  returns: v.id("formTemplates"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    // Check if user has admin access to this organization
    const isAdmin = await hasOrgAdminAccess(ctx, user._id, args.organizationId);
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    return await ctx.db.insert("formTemplates", {
      organizationId: args.organizationId,
      version: await getNextTemplateVersion(ctx, args.organizationId),
      name: args.name,
      description: args.description,
      formDefinition: args.formDefinition,
      sections: args.sections,
      isPublished: false,
    });
  },
});

/**
 * Update a form template (admin only).
 * Creates a new version if the template was already published.
 */
export const update = mutation({
  args: {
    templateId: v.id("formTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    formDefinition: v.optional(v.string()),
    sections: v.optional(v.array(templateSectionValidator)),
    documentConfigs: v.optional(v.array(defaultDocumentConfigValidator)),
    paymentConfigs: v.optional(v.array(defaultPaymentConfigValidator)),
  },
  returns: v.id("formTemplates"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // Check admin access
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      template.organizationId,
    );
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    if (template.isPublished) {
      const newTemplateId = await duplicateTemplateAsDraft(ctx, {
        template,
        userId: user._id,
      });

      await ctx.db.patch(newTemplateId, {
        name: args.name ?? template.name,
        description: args.description ?? template.description,
        formDefinition: args.formDefinition ?? template.formDefinition,
        sections: args.sections ?? template.sections,
      });

      if (args.documentConfigs !== undefined) {
        await replaceTemplateDocumentConfigs(ctx, {
          templateId: newTemplateId,
          userId: user._id,
          documents: args.documentConfigs,
        });
      }
      if (args.paymentConfigs !== undefined) {
        await replaceTemplatePaymentConfigs(ctx, {
          templateId: newTemplateId,
          userId: user._id,
          fees: args.paymentConfigs,
        });
      }

      return newTemplateId;
    }

    await ctx.db.patch(args.templateId, {
      ...(args.name && { name: args.name }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.formDefinition !== undefined && {
        formDefinition: args.formDefinition,
      }),
      ...(args.sections && { sections: args.sections }),
    });

    if (args.documentConfigs !== undefined) {
      await replaceTemplateDocumentConfigs(ctx, {
        templateId: args.templateId,
        userId: user._id,
        documents: args.documentConfigs,
      });
    }
    if (args.paymentConfigs !== undefined) {
      await replaceTemplatePaymentConfigs(ctx, {
        templateId: args.templateId,
        userId: user._id,
        fees: args.paymentConfigs,
      });
    }

    return args.templateId;
  },
});

/**
 * Publish a form template (admin only).
 * Unpublishes any previously published template for the same organization.
 */
export const publish = mutation({
  args: { templateId: v.id("formTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // Check admin access
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      template.organizationId,
    );
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    const publishedTemplates = await ctx.db
      .query("formTemplates")
      .withIndex("byOrganization", (q) =>
        q.eq("organizationId", template.organizationId),
      )
      .filter((q) => q.eq(q.field("isPublished"), true))
      .collect();

    for (const published of publishedTemplates) {
      await ctx.db.patch(published._id, { isPublished: false });
    }

    await ctx.db.patch(args.templateId, { isPublished: true });

    return null;
  },
});

export const remove = mutation({
  args: { templateId: v.id("formTemplates") },
  returns: v.union(v.literal("deleted"), v.literal("archived")),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const template = await ctx.db.get(args.templateId);

    if (!template) {
      throw new Error("Template not found");
    }

    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      template.organizationId,
    );
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    const linkedApplications = await ctx.db
      .query("applications")
      .withIndex("byOrganizationId", (q) =>
        q.eq("organizationId", template.organizationId),
      )
      .collect();

    if (
      linkedApplications.some(
        (application) => application.formTemplateId === template._id,
      )
    ) {
      await ctx.db.patch(args.templateId, {
        isArchived: true,
        isPublished: false,
      });

      return "archived";
    }

    await clearTemplateDocumentConfigs(ctx, args.templateId);
    await clearTemplatePaymentConfigs(ctx, args.templateId);
    await ctx.db.delete(args.templateId);

    return "deleted";
  },
});
