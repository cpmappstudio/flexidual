import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";
import { hasOrgAdminAccess } from "./lib/permissions";
import { Id } from "./_generated/dataModel";

const documentStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

const documentVisibility = v.union(
  v.literal("required"),
  v.literal("optional"),
  v.literal("hidden"),
);

const documentConfigValidator = v.object({
  _id: v.id("applicationDocumentConfig"),
  _creationTime: v.number(),
  applicationId: v.id("applications"),
  documentTypeId: v.string(),
  visibility: documentVisibility,
  updatedAt: v.number(),
  updatedBy: v.id("users"),
  isCustom: v.optional(v.boolean()),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
});

const documentValidator = v.object({
  _id: v.id("applicationDocuments"),
  _creationTime: v.number(),
  applicationId: v.id("applications"),
  documentTypeId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  storageId: v.id("_storage"),
  fileName: v.string(),
  contentType: v.string(),
  fileSize: v.number(),
  status: documentStatus,
  uploadedBy: v.id("users"),
  uploadedAt: v.number(),
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.number()),
  rejectionReason: v.optional(v.string()),
});

const uploadedByUserValidator = v.object({
  _id: v.id("users"),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
});

/**
 * Helper to verify user has access to an application.
 */
async function verifyApplicationAccess(
  ctx: QueryCtx | MutationCtx,
  applicationId: Id<"applications">,
  userId: Id<"users">,
  requireAdmin: boolean = false,
) {
  const application = await ctx.db.get(applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  const isOwner = application.userId === userId;
  const isAdmin = await hasOrgAdminAccess(
    ctx,
    userId,
    application.organizationId,
  );

  if (requireAdmin && !isAdmin) {
    throw new Error("Admin access required");
  }

  if (!isOwner && !isAdmin) {
    throw new Error("Unauthorized");
  }

  return { application, isOwner, isAdmin };
}

/**
 * Generate an upload URL for file storage.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    await getCurrentUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Get all documents for an application with file URLs.
 */
export const getByApplication = query({
  args: { applicationId: v.id("applications") },
  returns: v.array(
    v.object({
      ...documentValidator.fields,
      url: v.union(v.string(), v.null()),
      uploadedByUser: v.optional(uploadedByUserValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id);

    const documents = await ctx.db
      .query("applicationDocuments")
      .withIndex("byApplication", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();

    // Batch fetch users and URLs to avoid N+1 queries
    const userIds = [...new Set(documents.map((d) => d.uploadedBy))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(users.filter(Boolean).map((u) => [u!._id, u!]));

    const result = await Promise.all(
      documents.map(async (doc) => {
        const url = await ctx.storage.getUrl(doc.storageId);
        const uploadedByUser = userMap.get(doc.uploadedBy);

        return {
          ...doc,
          url,
          uploadedByUser: uploadedByUser
            ? {
                _id: uploadedByUser._id,
                firstName: uploadedByUser.firstName,
                lastName: uploadedByUser.lastName,
                email: uploadedByUser.email,
              }
            : undefined,
        };
      }),
    );

    return result;
  },
});

/**
 * Upload a new document for an application.
 */
export const upload = mutation({
  args: {
    applicationId: v.id("applications"),
    documentTypeId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
  },
  returns: v.id("applicationDocuments"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id);

    // Check if a document of this type already exists
    const existing = await ctx.db
      .query("applicationDocuments")
      .withIndex("byApplicationAndType", (q) =>
        q
          .eq("applicationId", args.applicationId)
          .eq("documentTypeId", args.documentTypeId),
      )
      .unique();

    // If exists, delete the old file from storage and the document record
    if (existing) {
      await ctx.storage.delete(existing.storageId);
      await ctx.db.delete(existing._id);
    }

    // Create new document record
    return await ctx.db.insert("applicationDocuments", {
      applicationId: args.applicationId,
      documentTypeId: args.documentTypeId,
      name: args.name,
      description: args.description,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      fileSize: args.fileSize,
      status: "pending",
      uploadedBy: user._id,
      uploadedAt: Date.now(),
    });
  },
});

/**
 * Update document status (admin only).
 */
export const updateStatus = mutation({
  args: {
    documentId: v.id("applicationDocuments"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    rejectionReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const document = await ctx.db.get(args.documentId);

    if (!document) {
      throw new Error("Document not found");
    }

    await verifyApplicationAccess(ctx, document.applicationId, user._id, true);

    if (args.status === "rejected" && !args.rejectionReason) {
      throw new Error("Rejection reason is required");
    }

    await ctx.db.patch(args.documentId, {
      status: args.status,
      reviewedBy: user._id,
      reviewedAt: Date.now(),
      rejectionReason:
        args.status === "rejected" ? args.rejectionReason : undefined,
    });

    return null;
  },
});

/**
 * Delete a document (anyone with application access can delete).
 */
export const remove = mutation({
  args: { documentId: v.id("applicationDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const document = await ctx.db.get(args.documentId);

    if (!document) {
      throw new Error("Document not found");
    }

    // Verify user has access to the application (owner or admin)
    await verifyApplicationAccess(ctx, document.applicationId, user._id);

    // Delete file from storage
    await ctx.storage.delete(document.storageId);

    // Delete document record
    await ctx.db.delete(args.documentId);

    return null;
  },
});

/**
 * Get document summary for an application.
 */
export const getSummary = query({
  args: { applicationId: v.id("applications") },
  returns: v.object({
    total: v.number(),
    pending: v.number(),
    approved: v.number(),
    rejected: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id);

    const documents = await ctx.db
      .query("applicationDocuments")
      .withIndex("byApplication", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();

    return {
      total: documents.length,
      pending: documents.filter((d) => d.status === "pending").length,
      approved: documents.filter((d) => d.status === "approved").length,
      rejected: documents.filter((d) => d.status === "rejected").length,
    };
  },
});

/**
 * Get document visibility configuration for an application.
 */
export const getConfigByApplication = query({
  args: { applicationId: v.id("applications") },
  returns: v.array(documentConfigValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id);

    return await ctx.db
      .query("applicationDocumentConfig")
      .withIndex("byApplication", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
  },
});

/**
 * Update document visibility for an application (admin only).
 */
export const updateVisibility = mutation({
  args: {
    applicationId: v.id("applications"),
    documentTypeId: v.string(),
    visibility: documentVisibility,
  },
  returns: v.id("applicationDocumentConfig"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id, true);

    // Check if config already exists
    const existing = await ctx.db
      .query("applicationDocumentConfig")
      .withIndex("byApplicationAndType", (q) =>
        q
          .eq("applicationId", args.applicationId)
          .eq("documentTypeId", args.documentTypeId),
      )
      .unique();

    if (existing) {
      // Update existing config
      await ctx.db.patch(existing._id, {
        visibility: args.visibility,
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
      return existing._id;
    }

    // Create new config
    return await ctx.db.insert("applicationDocumentConfig", {
      applicationId: args.applicationId,
      documentTypeId: args.documentTypeId,
      visibility: args.visibility,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
  },
});

/**
 * Create a custom document type for an application (admin only).
 */
export const createCustomDocumentType = mutation({
  args: {
    applicationId: v.id("applications"),
    name: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
  },
  returns: v.id("applicationDocumentConfig"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id, true);

    // Generate a unique documentTypeId from the name
    const baseId = args.name
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const timestamp = Date.now().toString(36);
    const documentTypeId = `custom_${baseId}_${timestamp}`;

    // Determine visibility based on required flag
    const visibility = args.required ? "required" : "optional";

    return await ctx.db.insert("applicationDocumentConfig", {
      applicationId: args.applicationId,
      documentTypeId,
      visibility,
      updatedAt: Date.now(),
      updatedBy: user._id,
      isCustom: true,
      name: args.name,
      description: args.description,
    });
  },
});

/**
 * Update a custom document type (admin only).
 */
export const updateCustomDocumentType = mutation({
  args: {
    configId: v.id("applicationDocumentConfig"),
    name: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const config = await ctx.db.get(args.configId);

    if (!config) {
      throw new Error("Document type not found");
    }

    if (!config.isCustom) {
      throw new Error("Cannot edit non-custom document types");
    }

    await verifyApplicationAccess(ctx, config.applicationId, user._id, true);

    const visibility = args.required ? "required" : "optional";

    await ctx.db.patch(args.configId, {
      name: args.name,
      description: args.description,
      visibility,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });

    return null;
  },
});

/**
 * Delete a custom document type (admin only).
 */
export const deleteCustomDocumentType = mutation({
  args: {
    configId: v.id("applicationDocumentConfig"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const config = await ctx.db.get(args.configId);

    if (!config) {
      throw new Error("Document type not found");
    }

    if (!config.isCustom) {
      throw new Error("Cannot delete non-custom document types");
    }

    await verifyApplicationAccess(ctx, config.applicationId, user._id, true);

    // Check if there are uploaded documents for this type
    const uploadedDoc = await ctx.db
      .query("applicationDocuments")
      .withIndex("byApplicationAndType", (q) =>
        q
          .eq("applicationId", config.applicationId)
          .eq("documentTypeId", config.documentTypeId),
      )
      .first();

    if (uploadedDoc) {
      // Delete the uploaded document and its storage
      await ctx.storage.delete(uploadedDoc.storageId);
      await ctx.db.delete(uploadedDoc._id);
    }

    // Delete the config
    await ctx.db.delete(args.configId);

    return null;
  },
});
