import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";
import { duplicateTemplateAsDraft } from "./lib/formTemplates";
import { hasOrgAdminAccess } from "./lib/permissions";

const documentVisibility = v.union(
  v.literal("required"),
  v.literal("optional"),
  v.literal("hidden"),
);

const templateDocumentConfigValidator = v.object({
  _id: v.id("templateDocumentConfig"),
  _creationTime: v.number(),
  templateId: v.id("formTemplates"),
  documentTypeId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  visibility: documentVisibility,
  updatedAt: v.number(),
  updatedBy: v.id("users"),
});

const templateDocumentMutationResultValidator = v.object({
  templateId: v.id("formTemplates"),
});

const templateDocumentMutationWithConfigResultValidator = v.object({
  templateId: v.id("formTemplates"),
  configId: v.id("templateDocumentConfig"),
});

async function verifyTemplateAdminAccess(
  ctx: QueryCtx | MutationCtx,
  templateId: Id<"formTemplates">,
  userId: Id<"users">,
) {
  const template = await ctx.db.get(templateId);
  if (!template) {
    throw new Error("Template not found");
  }

  const isAdmin = await hasOrgAdminAccess(ctx, userId, template.organizationId);
  if (!isAdmin) {
    throw new Error("Admin access required");
  }

  return template;
}

async function getEditableTemplateId(
  ctx: MutationCtx,
  templateId: Id<"formTemplates">,
  userId: Id<"users">,
) {
  const template = await verifyTemplateAdminAccess(ctx, templateId, userId);

  if (!template.isPublished) {
    return template._id;
  }

  return await duplicateTemplateAsDraft(ctx, {
    template,
    userId,
  });
}

async function getEditableTemplateConfig(
  ctx: MutationCtx,
  configId: Id<"templateDocumentConfig">,
  userId: Id<"users">,
) {
  const config = await ctx.db.get(configId);

  if (!config) {
    throw new Error("Document type not found");
  }

  const editableTemplateId = await getEditableTemplateId(
    ctx,
    config.templateId,
    userId,
  );

  if (editableTemplateId === config.templateId) {
    return {
      templateId: config.templateId,
      config,
    };
  }

  const editableConfig = await ctx.db
    .query("templateDocumentConfig")
    .withIndex("byTemplateAndType", (q) =>
      q
        .eq("templateId", editableTemplateId)
        .eq("documentTypeId", config.documentTypeId),
    )
    .unique();

  if (!editableConfig) {
    throw new Error("Document type not found");
  }

  return {
    templateId: editableTemplateId,
    config: editableConfig,
  };
}

export const getByTemplate = query({
  args: { templateId: v.id("formTemplates") },
  returns: v.array(templateDocumentConfigValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyTemplateAdminAccess(ctx, args.templateId, user._id);

    return await ctx.db
      .query("templateDocumentConfig")
      .withIndex("byTemplate", (q) => q.eq("templateId", args.templateId))
      .collect();
  },
});

export const createType = mutation({
  args: {
    templateId: v.id("formTemplates"),
    name: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
  },
  returns: templateDocumentMutationWithConfigResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const name = args.name.trim();

    if (!name) {
      throw new Error("Document name is required");
    }

    const editableTemplateId = await getEditableTemplateId(
      ctx,
      args.templateId,
      user._id,
    );

    const baseId = name
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const timestamp = Date.now().toString(36);
    const documentTypeId = `template_${baseId}_${timestamp}`;

    const configId = await ctx.db.insert("templateDocumentConfig", {
      templateId: editableTemplateId,
      documentTypeId,
      name,
      description: args.description,
      visibility: args.required ? "required" : "optional",
      updatedAt: Date.now(),
      updatedBy: user._id,
    });

    return {
      templateId: editableTemplateId,
      configId,
    };
  },
});

export const updateType = mutation({
  args: {
    configId: v.id("templateDocumentConfig"),
    name: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
  },
  returns: templateDocumentMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const name = args.name.trim();

    if (!name) {
      throw new Error("Document name is required");
    }

    const { templateId, config } = await getEditableTemplateConfig(
      ctx,
      args.configId,
      user._id,
    );

    await ctx.db.patch(config._id, {
      name,
      description: args.description,
      visibility: args.required ? "required" : "optional",
      updatedAt: Date.now(),
      updatedBy: user._id,
    });

    return { templateId };
  },
});

export const updateVisibility = mutation({
  args: {
    templateId: v.id("formTemplates"),
    documentTypeId: v.string(),
    visibility: documentVisibility,
  },
  returns: templateDocumentMutationWithConfigResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const editableTemplateId = await getEditableTemplateId(
      ctx,
      args.templateId,
      user._id,
    );

    const config = await ctx.db
      .query("templateDocumentConfig")
      .withIndex("byTemplateAndType", (q) =>
        q
          .eq("templateId", editableTemplateId)
          .eq("documentTypeId", args.documentTypeId),
      )
      .unique();

    if (!config) {
      throw new Error("Document type not found");
    }

    await ctx.db.patch(config._id, {
      visibility: args.visibility,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });

    return {
      templateId: editableTemplateId,
      configId: config._id,
    };
  },
});

export const deleteType = mutation({
  args: {
    configId: v.id("templateDocumentConfig"),
  },
  returns: templateDocumentMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const { templateId, config } = await getEditableTemplateConfig(
      ctx,
      args.configId,
      user._id,
    );

    await ctx.db.delete(config._id);

    return { templateId };
  },
});
