import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const orgMemberRole = v.union(
  v.literal("superadmin"),
  v.literal("admin"),
  v.literal("member"),
);

const status = v.union(
  v.literal("pending"),
  v.literal("reviewing"),
  v.literal("pre-admitted"),
  v.literal("admitted"),
  v.literal("denied"),
);

const feeStatus = v.union(
  v.literal("pending"),
  v.literal("partially_paid"),
  v.literal("paid"),
);

const paymentMethod = v.union(
  v.literal("online"),
  v.literal("cash"),
  v.literal("wire"),
);

const transactionStatus = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("failed"),
);

const paymentLinkStatus = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("expired"),
);

const recurringCadence = v.union(v.literal("monthly"));

const recurringPlanStatus = v.union(
  v.literal("active"),
  v.literal("completed"),
);

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

const legacyEntityType = v.union(
  v.literal("account"),
  v.literal("membership"),
  v.literal("application"),
  v.literal("fee"),
  v.literal("transaction"),
  v.literal("photo"),
  v.literal("document"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    isActive: v.boolean(),
    isSuperAdmin: v.boolean(),
  })
    .index("byClerkId", ["clerkId"])
    .index("byEmail", ["email"])
    .index("activeUsers", ["isActive"]),

  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("byClerkOrgId", ["clerkOrgId"])
    .index("bySlug", ["slug"]),

  organizationMembers: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    clerkMembershipId: v.string(),
    role: orgMemberRole,
    createdAt: v.number(),
  })
    .index("byUserId", ["userId"])
    .index("byOrganization", ["organizationId"])
    .index("byUserAndOrg", ["userId", "organizationId"])
    .index("byClerkMembershipId", ["clerkMembershipId"]),

  formTemplates: defineTable({
    organizationId: v.id("organizations"),
    version: v.number(),
    name: v.string(),
    description: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("base"), v.literal("custom"))),
    isArchived: v.optional(v.boolean()),
    formDefinition: v.optional(v.string()),
    sections: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        order: v.number(),
        fields: v.array(
          v.object({
            key: v.string(),
            label: v.string(),
            type: v.string(),
            required: v.boolean(),
          }),
        ),
      }),
    ),
    isPublished: v.boolean(),
  }).index("byOrganization", ["organizationId"]),

  programs: defineTable({
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
  }).index("byOrganization", ["organizationId"]),

  programRecurringFeeConfig: defineTable({
    programId: v.id("programs"),
    planKey: v.string(),
    name: v.string(),
    cadence: recurringCadence,
    dueDayOfMonth: v.number(),
    timezone: v.string(),
    totalAmount: v.number(),
    downPaymentAmount: v.optional(v.number()),
    installmentCount: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byProgram", ["programId"])
    .index("byProgramAndPlanKey", ["programId", "planKey"]),

  programFeeConfig: defineTable({
    programId: v.id("programs"),
    feeKey: v.string(),
    name: v.string(),
    totalAmount: v.number(),
    downPaymentPercent: v.number(),
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
    recurringPlanId: v.optional(v.id("programRecurringFeeConfig")),
    installmentIndex: v.optional(v.number()),
    installmentCount: v.optional(v.number()),
    dueDayOfMonth: v.optional(v.number()),
    timezone: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
  })
    .index("byProgram", ["programId"])
    .index("byProgramAndFeeKey", ["programId", "feeKey"])
    .index("byRecurringPlan", ["recurringPlanId"]),

  templateRecurringFeeConfig: defineTable({
    templateId: v.id("formTemplates"),
    planKey: v.string(),
    name: v.string(),
    cadence: recurringCadence,
    dueDayOfMonth: v.number(),
    timezone: v.string(),
    totalAmount: v.number(),
    downPaymentAmount: v.optional(v.number()),
    installmentCount: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byTemplate", ["templateId"])
    .index("byTemplateAndPlanKey", ["templateId", "planKey"]),

  templateFeeConfig: defineTable({
    templateId: v.id("formTemplates"),
    feeKey: v.string(),
    name: v.string(),
    totalAmount: v.number(),
    downPaymentPercent: v.number(),
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
    recurringPlanId: v.optional(v.id("templateRecurringFeeConfig")),
    installmentIndex: v.optional(v.number()),
    installmentCount: v.optional(v.number()),
    dueDayOfMonth: v.optional(v.number()),
    timezone: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
  })
    .index("byTemplate", ["templateId"])
    .index("byTemplateAndFeeKey", ["templateId", "feeKey"])
    .index("byRecurringPlan", ["recurringPlanId"]),

  applications: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    programId: v.optional(v.id("programs")),
    formTemplateId: v.optional(v.id("formTemplates")),
    formTemplateVersion: v.optional(v.number()),
    applicationCode: v.string(),
    status: status,
    isArchived: v.optional(v.boolean()),
    applicant: v.optional(
      v.object({
        photoStorageId: v.optional(v.id("_storage")),
        firstName: v.string(),
        lastName: v.string(),
        email: v.string(),
        telephone: v.string(),
      }),
    ),
    programSnapshot: v.optional(
      v.object({
        name: v.string(),
        iconKey: v.optional(v.string()),
      }),
    ),
    formDefinitionSnapshot: v.optional(v.string()),
    formData: v.record(
      v.string(),
      v.record(
        v.string(),
        v.union(
          v.string(),
          v.number(),
          v.boolean(),
          v.null(),
          v.id("_storage"),
        ),
      ),
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    paymentSummary: v.optional(
      v.object({
        totalDue: v.number(),
        totalPaid: v.number(),
        totalPending: v.number(),
        feeCount: v.number(),
        paidCount: v.number(),
      }),
    ),
  })
    .index("byUserId", ["userId"])
    .index("byUserIdAndOrganizationId", ["userId", "organizationId"])
    .index("byOrganizationId", ["organizationId"])
    .index("byProgram", ["programId"])
    .index("byOrganizationIdAndIsArchived", ["organizationId", "isArchived"])
    .index("byOrganizationIdAndIsArchivedAndStatus", [
      "organizationId",
      "isArchived",
      "status",
    ])
    .index("byOrganizationIdAndStatus", ["organizationId", "status"])
    .index("byStatus", ["status"])
    .index("byApplicationCode", ["applicationCode"]),

  recurringFeePlans: defineTable({
    applicationId: v.id("applications"),
    name: v.string(),
    description: v.optional(v.string()),
    cadence: recurringCadence,
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD
    dueDayOfMonth: v.number(), // 1-31
    timezone: v.string(), // IANA timezone
    totalAmount: v.number(), // In cents
    downPaymentAmount: v.optional(v.number()), // In cents
    installmentCount: v.number(),
    status: recurringPlanStatus,
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byApplication", ["applicationId"]),

  fees: defineTable({
    applicationId: v.id("applications"),
    name: v.string(),
    description: v.optional(v.string()),
    totalAmount: v.number(), // In cents
    downPaymentPercent: v.number(), // 0-100
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isDefault: v.boolean(),
    isRequired: v.boolean(),
    status: feeStatus,
    paidAmount: v.number(), // In cents
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
    createdBy: v.id("users"),
    recurringPlanId: v.optional(v.id("recurringFeePlans")),
    installmentIndex: v.optional(v.number()),
    installmentCount: v.optional(v.number()),
    dueDate: v.optional(v.string()), // YYYY-MM-DD
    timezone: v.optional(v.string()), // IANA timezone
    isRecurring: v.optional(v.boolean()),
  })
    .index("byApplication", ["applicationId"])
    .index("byStatus", ["status"])
    .index("byRecurringPlan", ["recurringPlanId"]),

  transactions: defineTable({
    applicationId: v.id("applications"),
    feeId: v.id("fees"),
    amount: v.number(), // In cents
    method: paymentMethod,
    status: transactionStatus,
    squarePaymentId: v.optional(v.string()),
    squareOrderId: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    reference: v.optional(v.string()),
    registeredBy: v.optional(v.id("users")),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("byApplication", ["applicationId"])
    .index("byFee", ["feeId"])
    .index("bySquarePaymentId", ["squarePaymentId"]),

  paymentLinks: defineTable({
    applicationId: v.id("applications"),
    feeIds: v.array(v.id("fees")),
    squareLinkId: v.string(),
    squareOrderId: v.string(),
    squareUrl: v.string(),
    totalAmount: v.number(), // In cents
    status: paymentLinkStatus,
    idempotencyKey: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("byApplication", ["applicationId"])
    .index("bySquareOrderId", ["squareOrderId"])
    .index("byIdempotencyKey", ["idempotencyKey"]),

  webhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    processedAt: v.number(),
  }).index("byEventId", ["eventId"]),

  applicationDocuments: defineTable({
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
  })
    .index("byApplication", ["applicationId"])
    .index("byApplicationAndType", ["applicationId", "documentTypeId"]),

  applicationDocumentConfig: defineTable({
    applicationId: v.id("applications"),
    documentTypeId: v.string(),
    visibility: documentVisibility,
    updatedAt: v.number(),
    updatedBy: v.id("users"),
    // Optional fields for custom document types (created by admin)
    isCustom: v.optional(v.boolean()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  })
    .index("byApplication", ["applicationId"])
    .index("byApplicationAndType", ["applicationId", "documentTypeId"]),

  programDocumentConfig: defineTable({
    programId: v.id("programs"),
    documentTypeId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    visibility: documentVisibility,
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  })
    .index("byProgram", ["programId"])
    .index("byProgramAndType", ["programId", "documentTypeId"]),

  templateDocumentConfig: defineTable({
    templateId: v.id("formTemplates"),
    documentTypeId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    visibility: documentVisibility,
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  })
    .index("byTemplate", ["templateId"])
    .index("byTemplateAndType", ["templateId", "documentTypeId"]),

  organizationPaymentSettings: defineTable({
    organizationId: v.id("organizations"),
    wireTransferEnabled: v.boolean(),
    wireTransferThresholdCents: v.optional(v.number()),
    wireTransferPdfStorageId: v.optional(v.id("_storage")),
    wireTransferPdfFileName: v.optional(v.string()),
    wireTransferPdfContentType: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  }).index("byOrganization", ["organizationId"]),

  legacyMigrationMappings: defineTable({
    source: v.string(),
    entityType: legacyEntityType,
    legacyId: v.string(),
    convexId: v.string(),
    checksum: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("bySourceAndEntityTypeAndLegacyId", [
      "source",
      "entityType",
      "legacyId",
    ])
    .index("bySourceAndEntityTypeAndConvexId", [
      "source",
      "entityType",
      "convexId",
    ])
    .index("bySourceAndEntityType", ["source", "entityType"]),
});
