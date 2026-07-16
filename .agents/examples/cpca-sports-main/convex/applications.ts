import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserOrNull } from "./lib/auth";
import { requireOrgAccess, hasOrgAdminAccess } from "./lib/permissions";
import {
  cloneProgramDocumentConfigsToApplication,
  cloneProgramPaymentConfigsToApplication,
} from "./lib/applicationDefaults";
import {
  buildApplicationListSummary,
  applicationListItemValidator,
} from "./lib/applicationSummary";
import { feeSummaryValidator } from "./lib/feeSummary";
import {
  getApplicantFromFormData,
  getApplicationApplicant,
  getApplicationPhotoStorageId,
  getProgramSnapshotFromFormData,
} from "./lib/applicationSnapshots";
import {
  applicantValidator,
  applicationStatus,
  formDataValidator,
  programSnapshotValidator,
} from "./lib/validators";

const applicationValidator = v.object({
  _id: v.id("applications"),
  _creationTime: v.number(),
  userId: v.id("users"),
  organizationId: v.id("organizations"),
  programId: v.optional(v.id("programs")),
  formTemplateId: v.optional(v.id("formTemplates")),
  formTemplateVersion: v.optional(v.number()),
  applicationCode: v.string(),
  status: applicationStatus,
  isArchived: v.optional(v.boolean()),
  applicant: v.optional(applicantValidator),
  programSnapshot: v.optional(programSnapshotValidator),
  formDefinitionSnapshot: v.optional(v.string()),
  formData: formDataValidator,
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.number()),
  paymentSummary: v.optional(feeSummaryValidator),
});

function canReceiveApplications(program: {
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

/**
 * Generate a unique application code.
 */
function generateApplicationCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `APP-${timestamp}-${random}`;
}

/**
 * Submit a new application (authenticated user).
 */
export const submit = mutation({
  args: {
    organizationSlug: v.string(),
    programId: v.id("programs"),
    applicant: applicantValidator,
    formData: formDataValidator,
  },
  returns: v.object({
    applicationId: v.id("applications"),
    applicationCode: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user, organization } = await requireOrgAccess(
      ctx,
      args.organizationSlug,
    );

    const submittedAt = Date.now();
    const program = await ctx.db.get(args.programId);

    if (!program) {
      throw new Error("Program not found");
    }
    if (program.organizationId !== organization._id) {
      throw new Error("Program does not belong to this organization");
    }
    if (!canReceiveApplications(program)) {
      throw new Error("Program is not available for applications");
    }
    if (!program.formDefinition) {
      throw new Error("Program form is not configured");
    }

    const applicationCode = generateApplicationCode();

    const existing = await ctx.db
      .query("applications")
      .withIndex("byApplicationCode", (q) =>
        q.eq("applicationCode", applicationCode),
      )
      .unique();

    if (existing) {
      throw new Error("Application code collision. Please try again.");
    }

    const programSnapshot = {
      name: program.name,
      ...(program.iconKey ? { iconKey: program.iconKey } : {}),
    };

    const applicationId = await ctx.db.insert("applications", {
      userId: user._id,
      organizationId: organization._id,
      programId: program._id,
      applicationCode,
      status: "pending",
      isArchived: false,
      applicant: args.applicant,
      programSnapshot,
      formDefinitionSnapshot: program.formDefinition,
      formData: args.formData,
    });

    await cloneProgramDocumentConfigsToApplication(ctx, {
      programId: program._id,
      applicationId,
      userId: user._id,
      updatedAt: submittedAt,
    });
    await cloneProgramPaymentConfigsToApplication(ctx, {
      programId: program._id,
      applicationId,
      userId: user._id,
      submittedAt,
    });

    return {
      applicationId,
      applicationCode,
    };
  },
});

/**
 * Get my applications (authenticated user).
 */
export const listMine = query({
  args: {},
  returns: v.array(applicationValidator),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("applications")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .filter((q) => q.neq(q.field("isArchived"), true))
      .order("desc")
      .collect();
  },
});

/**
 * Get applications by organization (admin only).
 * Returns empty array if organization doesn't exist (handles deleted orgs gracefully).
 */
export const listByOrganization = query({
  args: {
    organizationSlug: v.string(),
    status: v.optional(applicationStatus),
    isArchived: v.optional(v.boolean()),
  },
  returns: v.array(applicationValidator),
  handler: async (ctx, args) => {
    // Find the organization first
    const organization = await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", args.organizationSlug))
      .unique();

    // Return empty array if org doesn't exist (handles deleted orgs gracefully)
    if (!organization) {
      return [];
    }

    // Check admin access
    const user = await getCurrentUser(ctx);
    const isAdmin = await hasOrgAdminAccess(ctx, user._id, organization._id);
    if (!isAdmin) {
      return [];
    }

    const isArchived = args.isArchived === true;

    if (isArchived && args.status) {
      return await ctx.db
        .query("applications")
        .withIndex("byOrganizationIdAndIsArchivedAndStatus", (q) =>
          q
            .eq("organizationId", organization._id)
            .eq("isArchived", true)
            .eq("status", args.status!),
        )
        .order("desc")
        .collect();
    }

    if (isArchived) {
      return await ctx.db
        .query("applications")
        .withIndex("byOrganizationIdAndIsArchived", (q) =>
          q.eq("organizationId", organization._id).eq("isArchived", true),
        )
        .order("desc")
        .collect();
    }

    if (args.status) {
      return await ctx.db
        .query("applications")
        .withIndex("byOrganizationIdAndStatus", (q) =>
          q.eq("organizationId", organization._id).eq("status", args.status!),
        )
        .filter((q) => q.neq(q.field("isArchived"), true))
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("applications")
      .withIndex("byOrganizationId", (q) =>
        q.eq("organizationId", organization._id),
      )
      .filter((q) => q.neq(q.field("isArchived"), true))
      .order("desc")
      .collect();
  },
});

/**
 * Lightweight list for table rendering (owner only, scoped by organization).
 * Reduces payload by returning only the fields used by list/table views.
 */
export const listMineByOrganizationSummary = query({
  args: {
    organizationSlug: v.string(),
  },
  returns: v.array(applicationListItemValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return [];
    }

    const organization = await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", args.organizationSlug))
      .unique();

    if (!organization) {
      return [];
    }

    const applications = await ctx.db
      .query("applications")
      .withIndex("byUserIdAndOrganizationId", (q) =>
        q.eq("userId", user._id).eq("organizationId", organization._id),
      )
      .filter((q) => q.neq(q.field("isArchived"), true))
      .order("desc")
      .collect();

    return await buildApplicationListSummary(ctx, applications);
  },
});

/**
 * Lightweight list for table rendering (admin view).
 * Keeps authorization and optional status filter while minimizing returned fields.
 */
export const listByOrganizationSummary = query({
  args: {
    organizationSlug: v.string(),
    status: v.optional(applicationStatus),
    isArchived: v.optional(v.boolean()),
  },
  returns: v.array(applicationListItemValidator),
  handler: async (ctx, args) => {
    const organization = await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", args.organizationSlug))
      .unique();

    if (!organization) {
      return [];
    }

    const user = await getCurrentUser(ctx);
    const isAdmin = await hasOrgAdminAccess(ctx, user._id, organization._id);
    if (!isAdmin) {
      return [];
    }

    const isArchived = args.isArchived === true;

    const applications = isArchived
      ? args.status
        ? await ctx.db
            .query("applications")
            .withIndex("byOrganizationIdAndIsArchivedAndStatus", (q) =>
              q
                .eq("organizationId", organization._id)
                .eq("isArchived", true)
                .eq("status", args.status!),
            )
            .order("desc")
            .collect()
        : await ctx.db
            .query("applications")
            .withIndex("byOrganizationIdAndIsArchived", (q) =>
              q.eq("organizationId", organization._id).eq("isArchived", true),
            )
            .order("desc")
            .collect()
      : args.status
        ? await ctx.db
            .query("applications")
            .withIndex("byOrganizationIdAndStatus", (q) =>
              q
                .eq("organizationId", organization._id)
                .eq("status", args.status!),
            )
            .filter((q) => q.neq(q.field("isArchived"), true))
            .order("desc")
            .collect()
        : await ctx.db
            .query("applications")
            .withIndex("byOrganizationId", (q) =>
              q.eq("organizationId", organization._id),
            )
            .filter((q) => q.neq(q.field("isArchived"), true))
            .order("desc")
            .collect();

    return await buildApplicationListSummary(ctx, applications);
  },
});

/**
 * Get a single application by ID.
 * User can only access their own applications.
 * Admins can access any application in their organization.
 */
export const getById = query({
  args: { applicationId: v.id("applications") },
  returns: v.union(applicationValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const application = await ctx.db.get(args.applicationId);

    if (!application) {
      return null;
    }

    // Owner can always access
    if (application.userId === user._id) {
      return application;
    }

    // Check admin access
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );

    if (!isAdmin) {
      throw new Error("Unauthorized: Cannot access this application");
    }

    return application;
  },
});

/**
 * Get application by code (for lookup after submission).
 */
export const getByCode = query({
  args: { applicationCode: v.string() },
  returns: v.union(applicationValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const application = await ctx.db
      .query("applications")
      .withIndex("byApplicationCode", (q) =>
        q.eq("applicationCode", args.applicationCode),
      )
      .unique();

    if (!application) {
      return null;
    }

    // Owner can always access
    if (application.userId === user._id) {
      return application;
    }

    // Check admin access
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );

    if (!isAdmin) {
      throw new Error("Unauthorized: Cannot access this application");
    }

    return application;
  },
});

/**
 * Update application status (admin only).
 */
export const updateStatus = mutation({
  args: {
    applicationId: v.id("applications"),
    status: applicationStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const application = await ctx.db.get(args.applicationId);

    if (!application) {
      throw new Error("Application not found");
    }

    // Check admin access
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );

    if (!isAdmin) {
      throw new Error("Unauthorized: Admin access required");
    }

    await ctx.db.patch(args.applicationId, {
      status: args.status,
      reviewedBy: user._id,
      reviewedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Archive or restore an application (admin only).
 */
export const setArchived = mutation({
  args: {
    applicationId: v.id("applications"),
    isArchived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const application = await ctx.db.get(args.applicationId);

    if (!application) {
      throw new Error("Application not found");
    }

    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );

    if (!isAdmin) {
      throw new Error("Unauthorized: Admin access required");
    }

    if (application.isArchived === args.isArchived) {
      return null;
    }

    await ctx.db.patch(args.applicationId, {
      isArchived: args.isArchived,
    });

    return null;
  },
});

/**
 * Transfer application ownership to another user in the same organization.
 * Admins/superadmins only.
 */
export const transferOwnership = mutation({
  args: {
    applicationId: v.id("applications"),
    targetUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const application = await ctx.db.get(args.applicationId);

    if (!application) {
      throw new Error("Application not found");
    }

    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );
    if (!isAdmin) {
      throw new Error("Unauthorized: Admin access required");
    }

    if (application.userId === args.targetUserId) {
      return null;
    }

    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser || !targetUser.isActive) {
      throw new Error("Target user not found or inactive");
    }

    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("byUserAndOrg", (q) =>
        q
          .eq("userId", args.targetUserId)
          .eq("organizationId", application.organizationId),
      )
      .unique();

    if (!targetMembership && !targetUser.isSuperAdmin) {
      throw new Error(
        "Target user must belong to this organization to receive the application",
      );
    }

    await ctx.db.patch(args.applicationId, {
      userId: args.targetUserId,
    });

    return null;
  },
});

/**
 * Update application photo (owner or admin can update).
 */
export const updatePhoto = mutation({
  args: {
    applicationId: v.id("applications"),
    photoStorageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const application = await ctx.db.get(args.applicationId);

    if (!application) {
      throw new Error("Application not found");
    }

    // Check access: owner or admin
    const isOwner = application.userId === user._id;
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );

    if (!isOwner && !isAdmin) {
      throw new Error("Unauthorized: Access required");
    }

    // Delete old photo from storage if it exists
    const oldPhotoId = getApplicationPhotoStorageId(application);
    if (oldPhotoId) {
      await ctx.storage.delete(oldPhotoId);
    }

    // Update photo in formData
    const updatedFormData = {
      ...application.formData,
      athlete: {
        ...application.formData.athlete,
        photo: args.photoStorageId,
      },
    };

    await ctx.db.patch(args.applicationId, {
      applicant: {
        ...(getApplicationApplicant(application) ?? {
          firstName: "",
          lastName: "",
          email: "",
          telephone: "",
        }),
        photoStorageId: args.photoStorageId,
      },
      formData: updatedFormData,
    });

    return null;
  },
});

/**
 * Update application form data (admin only).
 * This updates the form template sections (athlete, address, school, parents, additional).
 */
export const updateFormData = mutation({
  args: {
    applicationId: v.id("applications"),
    formData: formDataValidator,
    applicant: v.optional(applicantValidator),
    replaceAll: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const application = await ctx.db.get(args.applicationId);

    if (!application) {
      throw new Error("Application not found");
    }

    // Check admin access
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );

    if (!isAdmin) {
      throw new Error("Unauthorized: Admin access required");
    }

    const photoStorageId = application.formData.athlete?.photo;
    const updatedFormData = args.replaceAll
      ? {
          ...args.formData,
          ...(photoStorageId
            ? {
                athlete: {
                  ...args.formData.athlete,
                  photo: photoStorageId,
                },
              }
            : {}),
        }
      : {
          ...application.formData,
          ...args.formData,
          athlete: {
            ...application.formData.athlete,
            ...args.formData.athlete,
            ...(photoStorageId ? { photo: photoStorageId } : {}),
          },
        };

    await ctx.db.patch(args.applicationId, {
      applicant:
        args.applicant ??
        (application.programId
          ? application.applicant
          : getApplicantFromFormData(updatedFormData)),
      programSnapshot: application.programId
        ? application.programSnapshot
        : getProgramSnapshotFromFormData(updatedFormData),
      formData: updatedFormData,
    });

    return null;
  },
});

/**
 * Delete application (admin only).
 */
export const deleteApplication = mutation({
  args: {
    applicationId: v.id("applications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const application = await ctx.db.get(args.applicationId);

    if (!application) {
      throw new Error("Application not found");
    }

    // Check admin access
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );

    if (!isAdmin) {
      throw new Error("Unauthorized: Admin access required");
    }

    const photoStorageId = getApplicationPhotoStorageId(application);

    const [
      documents,
      documentConfigs,
      transactions,
      paymentLinks,
      fees,
      recurringPlans,
    ] = await Promise.all([
      ctx.db
        .query("applicationDocuments")
        .withIndex("byApplication", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("applicationDocumentConfig")
        .withIndex("byApplication", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("byApplication", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("paymentLinks")
        .withIndex("byApplication", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("fees")
        .withIndex("byApplication", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("recurringFeePlans")
        .withIndex("byApplication", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
    ]);

    const storageIdsToDelete = new Set<Id<"_storage">>();
    if (photoStorageId) {
      storageIdsToDelete.add(photoStorageId);
    }
    for (const document of documents) {
      storageIdsToDelete.add(document.storageId);
    }

    await Promise.all(
      [...storageIdsToDelete].map((storageId) => ctx.storage.delete(storageId)),
    );
    await Promise.all(documents.map((document) => ctx.db.delete(document._id)));
    await Promise.all(
      documentConfigs.map((config) => ctx.db.delete(config._id)),
    );
    await Promise.all(
      transactions.map((transaction) => ctx.db.delete(transaction._id)),
    );
    await Promise.all(
      paymentLinks.map((paymentLink) => ctx.db.delete(paymentLink._id)),
    );
    await Promise.all(fees.map((fee) => ctx.db.delete(fee._id)));
    await Promise.all(
      recurringPlans.map((recurringPlan) => ctx.db.delete(recurringPlan._id)),
    );
    await ctx.db.delete(args.applicationId);

    return null;
  },
});
