import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const documentVisibility = v.union(
  v.literal("required"),
  v.literal("optional"),
  v.literal("hidden"),
);

export const defaultDocumentConfigValidator = v.object({
  documentTypeId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  visibility: documentVisibility,
});

export async function clearProgramDocumentConfigs(
  ctx: MutationCtx,
  programId: Id<"programs">,
) {
  const documentConfigs = await ctx.db
    .query("programDocumentConfig")
    .withIndex("byProgram", (q) => q.eq("programId", programId))
    .collect();

  for (const documentConfig of documentConfigs) {
    await ctx.db.delete(documentConfig._id);
  }
}

export async function clearTemplateDocumentConfigs(
  ctx: MutationCtx,
  templateId: Id<"formTemplates">,
) {
  const documentConfigs = await ctx.db
    .query("templateDocumentConfig")
    .withIndex("byTemplate", (q) => q.eq("templateId", templateId))
    .collect();

  for (const documentConfig of documentConfigs) {
    await ctx.db.delete(documentConfig._id);
  }
}

export async function replaceProgramDocumentConfigs(
  ctx: MutationCtx,
  params: {
    programId: Id<"programs">;
    userId: Id<"users">;
    documents: Array<{
      documentTypeId: string;
      name: string;
      description?: string;
      visibility: "required" | "optional" | "hidden";
    }>;
  },
) {
  await clearProgramDocumentConfigs(ctx, params.programId);

  for (const document of params.documents) {
    await ctx.db.insert("programDocumentConfig", {
      programId: params.programId,
      documentTypeId: document.documentTypeId,
      name: document.name,
      description: document.description,
      visibility: document.visibility,
      updatedAt: Date.now(),
      updatedBy: params.userId,
    });
  }
}

export async function replaceTemplateDocumentConfigs(
  ctx: MutationCtx,
  params: {
    templateId: Id<"formTemplates">;
    userId: Id<"users">;
    documents: Array<{
      documentTypeId: string;
      name: string;
      description?: string;
      visibility: "required" | "optional" | "hidden";
    }>;
  },
) {
  await clearTemplateDocumentConfigs(ctx, params.templateId);

  for (const document of params.documents) {
    await ctx.db.insert("templateDocumentConfig", {
      templateId: params.templateId,
      documentTypeId: document.documentTypeId,
      name: document.name,
      description: document.description,
      visibility: document.visibility,
      updatedAt: Date.now(),
      updatedBy: params.userId,
    });
  }
}

export async function cloneProgramDocumentsToTemplate(
  ctx: MutationCtx,
  params: {
    programId: Id<"programs">;
    templateId: Id<"formTemplates">;
    userId: Id<"users">;
  },
) {
  const programDocuments = await ctx.db
    .query("programDocumentConfig")
    .withIndex("byProgram", (q) => q.eq("programId", params.programId))
    .collect();

  for (const document of programDocuments) {
    await ctx.db.insert("templateDocumentConfig", {
      templateId: params.templateId,
      documentTypeId: document.documentTypeId,
      name: document.name,
      description: document.description,
      visibility: document.visibility,
      updatedAt: Date.now(),
      updatedBy: params.userId,
    });
  }
}

export async function cloneTemplateDocumentsToTemplate(
  ctx: MutationCtx,
  params: {
    sourceTemplateId: Id<"formTemplates">;
    targetTemplateId: Id<"formTemplates">;
    userId: Id<"users">;
  },
) {
  const templateDocuments = await ctx.db
    .query("templateDocumentConfig")
    .withIndex("byTemplate", (q) => q.eq("templateId", params.sourceTemplateId))
    .collect();

  for (const document of templateDocuments) {
    await ctx.db.insert("templateDocumentConfig", {
      templateId: params.targetTemplateId,
      documentTypeId: document.documentTypeId,
      name: document.name,
      description: document.description,
      visibility: document.visibility,
      updatedAt: Date.now(),
      updatedBy: params.userId,
    });
  }
}
