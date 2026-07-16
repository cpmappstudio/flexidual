import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";
import {
  clearProgramDocumentConfigs,
  cloneProgramDocumentsToTemplate,
  defaultDocumentConfigValidator,
  replaceProgramDocumentConfigs,
  replaceTemplateDocumentConfigs,
} from "./lib/defaultDocuments";
import {
  clearProgramPaymentConfigs,
  cloneProgramPaymentsToTemplate,
  defaultPaymentConfigValidator,
  replaceProgramPaymentConfigs,
  replaceTemplatePaymentConfigs,
} from "./lib/defaultPayments";
import {
  getNextTemplateVersion,
  templateSectionValidator,
} from "./lib/formTemplates";
import { hasOrgAdminAccess, requireOrgAccess } from "./lib/permissions";
import { isProgramIconKey } from "../lib/programs/icon-keys";

const programValidator = v.object({
  _id: v.id("programs"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  iconKey: v.optional(v.string()),
  formTemplateId: v.optional(v.id("formTemplates")),
  formDefinition: v.optional(v.string()),
  isDraft: v.boolean(),
  isActive: v.optional(v.boolean()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const availableProgramValidator = v.object({
  _id: v.id("programs"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  iconKey: v.optional(v.string()),
  formDefinition: v.string(),
  updatedAt: v.number(),
});

function isProgramAvailable(program: {
  isDraft: boolean;
  isActive?: boolean;
  formDefinition?: string;
}) {
  return (
    !program.isDraft &&
    Boolean(program.formDefinition) &&
    program.isActive !== false
  );
}

function normalizeProgramName(value: string) {
  return value.trim().toLowerCase();
}

async function assertUniqueProgramName(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  name: string,
  exceptProgramId?: Id<"programs">,
) {
  const normalizedName = normalizeProgramName(name);
  const programs = await ctx.db
    .query("programs")
    .withIndex("byOrganization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const duplicate = programs.find(
    (program) =>
      program._id !== exceptProgramId &&
      normalizeProgramName(program.name) === normalizedName,
  );

  if (duplicate) {
    throw new Error("A program with this name already exists");
  }
}

async function verifyOrganizationAdminAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
) {
  const isAdmin = await hasOrgAdminAccess(ctx, userId, organizationId);
  if (!isAdmin) {
    throw new Error("Admin access required");
  }
}

async function verifyProgramAdminAccess(
  ctx: QueryCtx | MutationCtx,
  programId: Id<"programs">,
  userId: Id<"users">,
) {
  const program = await ctx.db.get(programId);
  if (!program) {
    throw new Error("Program not found");
  }

  await verifyOrganizationAdminAccess(ctx, program.organizationId, userId);
  return program;
}

export const getById = query({
  args: { programId: v.id("programs") },
  returns: v.union(programValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const program = await ctx.db.get(args.programId);

    if (!program) {
      return null;
    }

    await verifyOrganizationAdminAccess(ctx, program.organizationId, user._id);
    return program;
  },
});

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  returns: v.array(programValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    await verifyOrganizationAdminAccess(ctx, args.organizationId, user._id);

    const programs = await ctx.db
      .query("programs")
      .withIndex("byOrganization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    return programs.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const listForApplication = query({
  args: { organizationSlug: v.string() },
  returns: v.array(availableProgramValidator),
  handler: async (ctx, args) => {
    const { organization } = await requireOrgAccess(ctx, args.organizationSlug);

    const programs = await ctx.db
      .query("programs")
      .withIndex("byOrganization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    return programs
      .filter(isProgramAvailable)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((program) => ({
        _id: program._id,
        _creationTime: program._creationTime,
        organizationId: program.organizationId,
        name: program.name,
        description: program.description,
        iconKey: program.iconKey,
        formDefinition: program.formDefinition ?? "",
        updatedAt: program.updatedAt,
      }));
  },
});

export const createDraft = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.string(),
    iconKey: v.optional(v.string()),
  },
  returns: v.id("programs"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const name = args.name.trim();
    const description = args.description.trim();

    if (!name) {
      throw new Error("Program name is required");
    }
    if (!description) {
      throw new Error("Program description is required");
    }
    if (args.iconKey && !isProgramIconKey(args.iconKey)) {
      throw new Error("Invalid program icon");
    }

    await verifyOrganizationAdminAccess(ctx, args.organizationId, user._id);
    await assertUniqueProgramName(ctx, args.organizationId, name);

    const now = Date.now();

    return await ctx.db.insert("programs", {
      organizationId: args.organizationId,
      name,
      description,
      iconKey: args.iconKey,
      formTemplateId: undefined,
      formDefinition: undefined,
      isDraft: true,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const save = mutation({
  args: {
    programId: v.id("programs"),
    name: v.string(),
    description: v.optional(v.string()),
    iconKey: v.optional(v.string()),
    formDefinition: v.optional(v.string()),
    saveProgram: v.boolean(),
    saveTemplate: v.boolean(),
    templateName: v.optional(v.string()),
    templateDescription: v.optional(v.string()),
    templateSections: v.optional(v.array(templateSectionValidator)),
    documentConfigs: v.optional(v.array(defaultDocumentConfigValidator)),
    paymentConfigs: v.optional(v.array(defaultPaymentConfigValidator)),
  },
  returns: v.object({
    savedProgram: v.boolean(),
    templateId: v.union(v.id("formTemplates"), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const program = await verifyProgramAdminAccess(
      ctx,
      args.programId,
      user._id,
    );

    const shouldSaveProgram = args.saveProgram;
    const shouldSaveTemplate = args.saveTemplate;

    if (!shouldSaveProgram && !shouldSaveTemplate) {
      throw new Error("Select at least one save target");
    }

    const name = args.name.trim();
    if (shouldSaveProgram && !name) {
      throw new Error("Program name is required");
    }
    if (shouldSaveProgram) {
      await assertUniqueProgramName(
        ctx,
        program.organizationId,
        name,
        program._id,
      );
    }
    if (args.iconKey && !isProgramIconKey(args.iconKey)) {
      throw new Error("Invalid program icon");
    }

    let templateId: Id<"formTemplates"> | null = null;

    if (shouldSaveProgram) {
      await ctx.db.patch(args.programId, {
        name,
        ...(args.description !== undefined && {
          description: args.description.trim() || undefined,
        }),
        ...(args.iconKey !== undefined && { iconKey: args.iconKey }),
        formTemplateId: undefined,
        isDraft: false,
        ...(args.formDefinition !== undefined && {
          formDefinition: args.formDefinition,
        }),
        updatedAt: Date.now(),
      });

      if (args.documentConfigs !== undefined) {
        await replaceProgramDocumentConfigs(ctx, {
          programId: args.programId,
          userId: user._id,
          documents: args.documentConfigs,
        });
      }
      if (args.paymentConfigs !== undefined) {
        await replaceProgramPaymentConfigs(ctx, {
          programId: args.programId,
          userId: user._id,
          fees: args.paymentConfigs,
        });
      }
    }

    if (shouldSaveTemplate) {
      const templateName = args.templateName?.trim();

      if (!templateName) {
        throw new Error("Template name is required");
      }

      if (!args.formDefinition) {
        throw new Error("Template form definition is required");
      }

      if (!args.templateSections) {
        throw new Error("Template sections are required");
      }

      templateId = await ctx.db.insert("formTemplates", {
        organizationId: program.organizationId,
        version: await getNextTemplateVersion(ctx, program.organizationId),
        name: templateName,
        description: args.templateDescription?.trim() || undefined,
        formDefinition: args.formDefinition,
        sections: args.templateSections,
        isPublished: false,
      });

      if (args.documentConfigs !== undefined) {
        await replaceTemplateDocumentConfigs(ctx, {
          templateId,
          userId: user._id,
          documents: args.documentConfigs,
        });
      } else {
        await cloneProgramDocumentsToTemplate(ctx, {
          programId: args.programId,
          templateId,
          userId: user._id,
        });
      }

      if (args.paymentConfigs !== undefined) {
        await replaceTemplatePaymentConfigs(ctx, {
          templateId,
          userId: user._id,
          fees: args.paymentConfigs,
        });
      } else {
        await cloneProgramPaymentsToTemplate(ctx, {
          programId: args.programId,
          templateId,
          userId: user._id,
        });
      }
    }

    return {
      savedProgram: shouldSaveProgram,
      templateId,
    };
  },
});

export const setActive = mutation({
  args: {
    programId: v.id("programs"),
    isActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    await verifyProgramAdminAccess(ctx, args.programId, user._id);

    await ctx.db.patch(args.programId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const remove = mutation({
  args: {
    programId: v.id("programs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    await verifyProgramAdminAccess(ctx, args.programId, user._id);
    await clearProgramDocumentConfigs(ctx, args.programId);
    await clearProgramPaymentConfigs(ctx, args.programId);

    await ctx.db.delete(args.programId);

    return null;
  },
});
