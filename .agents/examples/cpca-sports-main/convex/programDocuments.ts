import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";
import { hasOrgAdminAccess } from "./lib/permissions";

const documentVisibility = v.union(
  v.literal("required"),
  v.literal("optional"),
  v.literal("hidden"),
);

const programDocumentConfigValidator = v.object({
  _id: v.id("programDocumentConfig"),
  _creationTime: v.number(),
  programId: v.id("programs"),
  documentTypeId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  visibility: documentVisibility,
  updatedAt: v.number(),
  updatedBy: v.id("users"),
});

async function verifyProgramAdminAccess(
  ctx: QueryCtx | MutationCtx,
  programId: Id<"programs">,
  userId: Id<"users">,
) {
  const program = await ctx.db.get(programId);
  if (!program) {
    throw new Error("Program not found");
  }

  const isAdmin = await hasOrgAdminAccess(ctx, userId, program.organizationId);
  if (!isAdmin) {
    throw new Error("Admin access required");
  }

  return program;
}

export const getByProgram = query({
  args: { programId: v.id("programs") },
  returns: v.array(programDocumentConfigValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyProgramAdminAccess(ctx, args.programId, user._id);

    return await ctx.db
      .query("programDocumentConfig")
      .withIndex("byProgram", (q) => q.eq("programId", args.programId))
      .collect();
  },
});

export const createType = mutation({
  args: {
    programId: v.id("programs"),
    name: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
  },
  returns: v.id("programDocumentConfig"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const name = args.name.trim();

    if (!name) {
      throw new Error("Document name is required");
    }

    await verifyProgramAdminAccess(ctx, args.programId, user._id);

    const baseId = name
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const timestamp = Date.now().toString(36);
    const documentTypeId = `program_${baseId}_${timestamp}`;

    return await ctx.db.insert("programDocumentConfig", {
      programId: args.programId,
      documentTypeId,
      name,
      description: args.description,
      visibility: args.required ? "required" : "optional",
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
  },
});

export const updateType = mutation({
  args: {
    configId: v.id("programDocumentConfig"),
    name: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const config = await ctx.db.get(args.configId);
    const name = args.name.trim();

    if (!config) {
      throw new Error("Document type not found");
    }

    if (!name) {
      throw new Error("Document name is required");
    }

    await verifyProgramAdminAccess(ctx, config.programId, user._id);

    await ctx.db.patch(args.configId, {
      name,
      description: args.description,
      visibility: args.required ? "required" : "optional",
      updatedAt: Date.now(),
      updatedBy: user._id,
    });

    return null;
  },
});

export const updateVisibility = mutation({
  args: {
    programId: v.id("programs"),
    documentTypeId: v.string(),
    visibility: documentVisibility,
  },
  returns: v.id("programDocumentConfig"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyProgramAdminAccess(ctx, args.programId, user._id);

    const config = await ctx.db
      .query("programDocumentConfig")
      .withIndex("byProgramAndType", (q) =>
        q
          .eq("programId", args.programId)
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

    return config._id;
  },
});

export const deleteType = mutation({
  args: {
    configId: v.id("programDocumentConfig"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const config = await ctx.db.get(args.configId);

    if (!config) {
      throw new Error("Document type not found");
    }

    await verifyProgramAdminAccess(ctx, config.programId, user._id);
    await ctx.db.delete(args.configId);

    return null;
  },
});
