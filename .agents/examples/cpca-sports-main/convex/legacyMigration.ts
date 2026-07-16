import { mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { applicationStatus } from "./lib/validators";
import { syncApplicationFeeSummary } from "./lib/feeSummary";
import {
  LEGACY_IMPORTED_TEMPLATE_DESCRIPTION,
  LEGACY_IMPORTED_TEMPLATE_NAME,
  legacyPreadmissionSerializedFormDefinition,
  legacyPreadmissionTemplateSections,
} from "../lib/forms/legacy-preadmission-template";
import { getLegacyPhotoStorageId } from "./lib/applicationSnapshots";

const orgMemberRole = v.union(
  v.literal("superadmin"),
  v.literal("admin"),
  v.literal("member"),
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

const migrationFormDataValidator = v.record(
  v.string(),
  v.record(
    v.string(),
    v.union(v.string(), v.number(), v.boolean(), v.null(), v.id("_storage")),
  ),
);

const legacyPaymentValidator = v.object({
  legacyPaymentId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  totalAmountCents: v.number(),
  dueAmountCents: v.number(),
  downPaymentPercent: v.number(),
  isRefundable: v.boolean(),
  isIncluded: v.boolean(),
  isRequired: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  legacyMethod: v.optional(v.string()),
  reference: v.optional(v.string()),
});

function assertMigrationSecret(secret: string) {
  const expected = process.env.LEGACY_MIGRATION_SECRET;
  if (!expected) {
    throw new Error("LEGACY_MIGRATION_SECRET is not configured");
  }
  if (secret !== expected) {
    throw new Error("Invalid migration secret");
  }
}

function normalizeProgramKey(value: string) {
  return value.trim().toLowerCase();
}

const specialApplicationProgramMappings: Record<string, string> = {
  "pg-basketball": "Basketball",
  hr14_baseball: "Baseball",
  "volleyball-club": "Volleyball",
};

function clampMoney(value: number): number {
  return Math.max(0, Math.round(value));
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toFeeStatus(
  totalAmount: number,
  paidAmount: number,
): "pending" | "partially_paid" | "paid" {
  if (totalAmount <= 0) {
    return "paid";
  }
  if (paidAmount <= 0) {
    return "pending";
  }
  if (paidAmount >= totalAmount) {
    return "paid";
  }
  return "partially_paid";
}

function normalizeHumanText(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEmail(value: string): string {
  return String(value).trim().toLowerCase();
}

function buildApplicantLookupKey(fullName: string, email: string): string {
  const normalizedFullName = normalizeHumanText(fullName);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedFullName || !normalizedEmail) {
    return "";
  }
  return `${normalizedFullName}::${normalizedEmail}`;
}

async function getLegacyMapping(
  ctx: MutationCtx,
  source: string,
  entityType:
    | "account"
    | "membership"
    | "application"
    | "fee"
    | "transaction"
    | "photo"
    | "document",
  legacyId: string,
) {
  return await ctx.db
    .query("legacyMigrationMappings")
    .withIndex("bySourceAndEntityTypeAndLegacyId", (q) =>
      q
        .eq("source", source)
        .eq("entityType", entityType)
        .eq("legacyId", legacyId),
    )
    .unique();
}

async function upsertLegacyMapping(
  ctx: MutationCtx,
  args: {
    source: string;
    entityType:
      | "account"
      | "membership"
      | "application"
      | "fee"
      | "transaction"
      | "photo"
      | "document";
    legacyId: string;
    convexId: string;
    checksum?: string;
  },
) {
  const existing = await getLegacyMapping(
    ctx,
    args.source,
    args.entityType,
    args.legacyId,
  );

  if (existing) {
    await ctx.db.patch(existing._id, {
      convexId: args.convexId,
      ...(args.checksum !== undefined ? { checksum: args.checksum } : {}),
      updatedAt: Date.now(),
    });
    return { mappingId: existing._id, created: false };
  }

  const mappingId = await ctx.db.insert("legacyMigrationMappings", {
    source: args.source,
    entityType: args.entityType,
    legacyId: args.legacyId,
    convexId: args.convexId,
    ...(args.checksum !== undefined ? { checksum: args.checksum } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { mappingId, created: true };
}

async function getPublishedTemplateForOrg(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
) {
  const templates = await ctx.db
    .query("formTemplates")
    .withIndex("byOrganization", (q) => q.eq("organizationId", organizationId))
    .collect();

  const published = templates.find((template) => template.isPublished);
  if (published) {
    return published;
  }

  if (templates.length > 0) {
    return templates.reduce((latest, template) =>
      template.version > latest.version ? template : latest,
    );
  }

  const templateId = await ctx.db.insert("formTemplates", {
    organizationId,
    version: 1,
    name: LEGACY_IMPORTED_TEMPLATE_NAME,
    description: LEGACY_IMPORTED_TEMPLATE_DESCRIPTION,
    formDefinition: legacyPreadmissionSerializedFormDefinition,
    sections: legacyPreadmissionTemplateSections,
    isPublished: true,
  });
  const template = await ctx.db.get(templateId);
  if (!template) {
    throw new Error("Failed to create fallback form template");
  }
  return template;
}

export const ensureFormTemplate = mutation({
  args: {
    secret: v.string(),
    organizationId: v.id("organizations"),
  },
  returns: v.object({
    formTemplateId: v.id("formTemplates"),
    formTemplateVersion: v.number(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);
    const template = await getPublishedTemplateForOrg(ctx, args.organizationId);
    return {
      formTemplateId: template._id,
      formTemplateVersion: template.version,
    };
  },
});

export const backfillPublishedProgramsFromSavedDrafts = mutation({
  args: {
    secret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    programsChecked: v.number(),
    matchedPrograms: v.number(),
    updatedPrograms: v.number(),
    affectedProgramIds: v.array(v.id("programs")),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const programs = await ctx.db.query("programs").collect();
    const affectedPrograms = programs.filter(
      (program) =>
        program.isDraft &&
        Boolean(program.formDefinition) &&
        program.updatedAt > program.createdAt,
    );

    if (!args.dryRun) {
      for (const program of affectedPrograms) {
        await ctx.db.patch(program._id, { isDraft: false });
      }
    }

    return {
      programsChecked: programs.length,
      matchedPrograms: affectedPrograms.length,
      updatedPrograms: args.dryRun ? 0 : affectedPrograms.length,
      affectedProgramIds: affectedPrograms.map((program) => program._id),
    };
  },
});

export const removeFormTemplateModeField = mutation({
  args: {
    secret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    templatesChecked: v.number(),
    matchedTemplates: v.number(),
    updatedTemplates: v.number(),
    affectedTemplateIds: v.array(v.id("formTemplates")),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const templates = await ctx.db.query("formTemplates").collect();
    const affectedTemplates = templates.filter(
      (template) => "mode" in template && template.mode !== undefined,
    );

    if (!args.dryRun) {
      for (const template of affectedTemplates) {
        const { mode, ...nextTemplate } = template as typeof template & {
          mode?: "base" | "custom";
        };
        void mode;
        await ctx.db.replace(template._id, nextTemplate);
      }
    }

    return {
      templatesChecked: templates.length,
      matchedTemplates: affectedTemplates.length,
      updatedTemplates: args.dryRun ? 0 : affectedTemplates.length,
      affectedTemplateIds: affectedTemplates.map((template) => template._id),
    };
  },
});

export const backfillLegacyImportedTemplateDefinition = mutation({
  args: {
    secret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    templatesChecked: v.number(),
    matchedTemplates: v.number(),
    updatedTemplates: v.number(),
    affectedTemplateIds: v.array(v.id("formTemplates")),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const templates = await ctx.db.query("formTemplates").collect();
    const affectedTemplates = templates.filter(
      (template) =>
        template.name === LEGACY_IMPORTED_TEMPLATE_NAME &&
        template.description === LEGACY_IMPORTED_TEMPLATE_DESCRIPTION &&
        !template.formDefinition,
    );

    if (!args.dryRun) {
      for (const template of affectedTemplates) {
        await ctx.db.patch(template._id, {
          formDefinition: legacyPreadmissionSerializedFormDefinition,
          sections: legacyPreadmissionTemplateSections,
        });
      }
    }

    return {
      templatesChecked: templates.length,
      matchedTemplates: affectedTemplates.length,
      updatedTemplates: args.dryRun ? 0 : affectedTemplates.length,
      affectedTemplateIds: affectedTemplates.map((template) => template._id),
    };
  },
});

export const fixApplicationSexFromFemaleReport = mutation({
  args: {
    secret: v.string(),
    organizationSlug: v.string(),
    reportRows: v.array(
      v.object({
        fullName: v.string(),
        email: v.string(),
      }),
    ),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    reportRows: v.number(),
    applicationsInOrganization: v.number(),
    matchedRows: v.number(),
    updatedApplications: v.number(),
    alreadyFemaleApplications: v.number(),
    ambiguousMatches: v.array(
      v.object({
        key: v.string(),
        applicationIds: v.array(v.id("applications")),
      }),
    ),
    unmatchedRows: v.array(
      v.object({
        fullName: v.string(),
        email: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const dryRun = args.dryRun ?? true;
    const organization = await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", args.organizationSlug))
      .unique();

    if (!organization) {
      throw new Error(`Organization not found: ${args.organizationSlug}`);
    }

    const applications = await ctx.db
      .query("applications")
      .withIndex("byOrganizationId", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    const applicationsById = new Map<string, (typeof applications)[number]>();
    const applicationsByKey = new Map<string, Array<Id<"applications">>>();

    for (const application of applications) {
      applicationsById.set(String(application._id), application);

      const athleteSection = application.formData.athlete;
      if (!athleteSection || typeof athleteSection !== "object") {
        continue;
      }

      const firstName =
        typeof athleteSection.firstName === "string"
          ? athleteSection.firstName
          : "";
      const lastName =
        typeof athleteSection.lastName === "string"
          ? athleteSection.lastName
          : "";
      const email =
        typeof athleteSection.email === "string" ? athleteSection.email : "";

      const key = buildApplicantLookupKey(`${firstName} ${lastName}`, email);
      if (!key) {
        continue;
      }

      const existing = applicationsByKey.get(key);
      if (existing) {
        existing.push(application._id);
      } else {
        applicationsByKey.set(key, [application._id]);
      }
    }

    const unmatchedRows: Array<{ fullName: string; email: string }> = [];
    const ambiguousMatches: Array<{
      key: string;
      applicationIds: Array<Id<"applications">>;
    }> = [];
    const ambiguousKeys = new Set<string>();
    const updatedApplicationIds = new Set<string>();
    const alreadyFemaleApplicationIds = new Set<string>();
    const processedApplicationIds = new Set<string>();
    let matchedRows = 0;

    for (const row of args.reportRows) {
      const key = buildApplicantLookupKey(row.fullName, row.email);
      if (!key) {
        unmatchedRows.push({
          fullName: row.fullName,
          email: row.email,
        });
        continue;
      }

      const applicationIds = applicationsByKey.get(key);
      if (!applicationIds || applicationIds.length === 0) {
        unmatchedRows.push({
          fullName: row.fullName,
          email: row.email,
        });
        continue;
      }

      if (applicationIds.length > 1 && !ambiguousKeys.has(key)) {
        ambiguousMatches.push({ key, applicationIds });
        ambiguousKeys.add(key);
      }

      matchedRows += 1;
      for (const applicationId of applicationIds) {
        const applicationIdKey = String(applicationId);
        if (processedApplicationIds.has(applicationIdKey)) {
          continue;
        }
        processedApplicationIds.add(applicationIdKey);

        const application = applicationsById.get(applicationIdKey);
        if (!application) {
          continue;
        }

        const athleteSection = application.formData.athlete;
        if (!athleteSection || typeof athleteSection !== "object") {
          continue;
        }

        const currentSexRaw =
          typeof athleteSection.sex === "string" ? athleteSection.sex : "";
        const currentSex = normalizeHumanText(currentSexRaw);
        if (currentSex === "female") {
          alreadyFemaleApplicationIds.add(applicationIdKey);
          continue;
        }

        if (!dryRun) {
          await ctx.db.patch(application._id, {
            formData: {
              ...application.formData,
              athlete: {
                ...athleteSection,
                sex: "female",
              },
            },
          });
        }

        updatedApplicationIds.add(applicationIdKey);
      }
    }

    return {
      organizationId: organization._id,
      reportRows: args.reportRows.length,
      applicationsInOrganization: applications.length,
      matchedRows,
      updatedApplications: updatedApplicationIds.size,
      alreadyFemaleApplications: alreadyFemaleApplicationIds.size,
      ambiguousMatches,
      unmatchedRows,
    };
  },
});

export const upsertAccountFromClerk = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
    legacyAccountId: v.string(),
    clerkUserId: v.string(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    isSuperAdmin: v.optional(v.boolean()),
  },
  returns: v.object({
    userId: v.id("users"),
    userCreated: v.boolean(),
    userUpdated: v.boolean(),
    mappingCreated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const [accountMapping, userByClerkId] = await Promise.all([
      getLegacyMapping(ctx, args.source, "account", args.legacyAccountId),
      ctx.db
        .query("users")
        .withIndex("byClerkId", (q) => q.eq("clerkId", args.clerkUserId))
        .unique(),
    ]);

    const userByMapping =
      accountMapping &&
      ((await ctx.db.get(accountMapping.convexId as Id<"users">)) ?? null);

    let user =
      userByMapping && userByClerkId && userByMapping._id !== userByClerkId._id
        ? userByClerkId
        : (userByMapping ?? userByClerkId);

    let userCreated = false;
    let userUpdated = false;

    if (user) {
      await ctx.db.patch(user._id, {
        clerkId: args.clerkUserId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        isActive: true,
        isSuperAdmin: args.isSuperAdmin ?? user.isSuperAdmin,
      });
      userUpdated = true;
    } else {
      const userId = await ctx.db.insert("users", {
        clerkId: args.clerkUserId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        isActive: true,
        isSuperAdmin: args.isSuperAdmin ?? false,
      });
      user = await ctx.db.get(userId);
      userCreated = true;
    }

    if (!user) {
      throw new Error("Failed to upsert user");
    }

    const mapping = await upsertLegacyMapping(ctx, {
      source: args.source,
      entityType: "account",
      legacyId: args.legacyAccountId,
      convexId: user._id,
    });

    return {
      userId: user._id,
      userCreated,
      userUpdated,
      mappingCreated: mapping.created,
    };
  },
});

export const upsertMembershipFromClerk = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
    legacyMembershipId: v.string(),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    clerkMembershipId: v.string(),
    role: orgMemberRole,
  },
  returns: v.object({
    membershipId: v.id("organizationMembers"),
    membershipCreated: v.boolean(),
    membershipUpdated: v.boolean(),
    mappingCreated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const [membershipMapping, membershipByClerkId] = await Promise.all([
      getLegacyMapping(ctx, args.source, "membership", args.legacyMembershipId),
      ctx.db
        .query("organizationMembers")
        .withIndex("byClerkMembershipId", (q) =>
          q.eq("clerkMembershipId", args.clerkMembershipId),
        )
        .unique(),
    ]);

    const membershipByMapping =
      membershipMapping &&
      ((await ctx.db.get(
        membershipMapping.convexId as Id<"organizationMembers">,
      )) ??
        null);

    let membership =
      membershipByMapping &&
      membershipByClerkId &&
      membershipByMapping._id !== membershipByClerkId._id
        ? membershipByClerkId
        : (membershipByMapping ?? membershipByClerkId);

    let membershipCreated = false;
    let membershipUpdated = false;

    if (!membership) {
      membership = await ctx.db
        .query("organizationMembers")
        .withIndex("byUserAndOrg", (q) =>
          q.eq("userId", args.userId).eq("organizationId", args.organizationId),
        )
        .unique();
    }

    if (membership) {
      await ctx.db.patch(membership._id, {
        userId: args.userId,
        organizationId: args.organizationId,
        clerkMembershipId: args.clerkMembershipId,
        role: args.role,
      });
      membershipUpdated = true;
    } else {
      const membershipId = await ctx.db.insert("organizationMembers", {
        userId: args.userId,
        organizationId: args.organizationId,
        clerkMembershipId: args.clerkMembershipId,
        role: args.role,
        createdAt: Date.now(),
      });
      membership = await ctx.db.get(membershipId);
      membershipCreated = true;
    }

    if (!membership) {
      throw new Error("Failed to upsert membership");
    }

    const mappingUpsert = await upsertLegacyMapping(ctx, {
      source: args.source,
      entityType: "membership",
      legacyId: args.legacyMembershipId,
      convexId: membership._id,
    });

    return {
      membershipId: membership._id,
      membershipCreated,
      membershipUpdated,
      mappingCreated: mappingUpsert.created,
    };
  },
});

export const upsertApplicationWithPayments = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
    legacyApplicationId: v.string(),
    userId: v.id("users"),
    actorUserId: v.id("users"),
    organizationId: v.id("organizations"),
    formTemplateId: v.id("formTemplates"),
    formTemplateVersion: v.number(),
    applicationCode: v.string(),
    status: applicationStatus,
    formData: migrationFormDataValidator,
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    payments: v.array(legacyPaymentValidator),
  },
  returns: v.object({
    applicationId: v.id("applications"),
    applicationCreated: v.boolean(),
    applicationUpdated: v.boolean(),
    feesCreated: v.number(),
    feesUpdated: v.number(),
    transactionsCreated: v.number(),
    transactionsUpdated: v.number(),
    transactionsDeleted: v.number(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const [user, actorUser, organization, formTemplate] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db.get(args.actorUserId),
      ctx.db.get(args.organizationId),
      ctx.db.get(args.formTemplateId),
    ]);

    if (!user) throw new Error("User not found");
    if (!actorUser) throw new Error("Actor user not found");
    if (!organization) throw new Error("Organization not found");
    if (!formTemplate) throw new Error("Form template not found");

    const existingMapping = await getLegacyMapping(
      ctx,
      args.source,
      "application",
      args.legacyApplicationId,
    );

    let application =
      existingMapping &&
      ((await ctx.db.get(existingMapping.convexId as Id<"applications">)) ??
        null);

    let applicationCreated = false;
    let applicationUpdated = false;

    if (!application) {
      const sameCode = await ctx.db
        .query("applications")
        .withIndex("byApplicationCode", (q) =>
          q.eq("applicationCode", args.applicationCode),
        )
        .unique();
      if (sameCode) {
        application = sameCode;
      }
    }

    const existingAthleteSection =
      (application?.formData.athlete as
        | Record<string, string | number | boolean | null | Id<"_storage">>
        | undefined) ?? {};
    const incomingAthleteSection =
      (args.formData.athlete as
        | Record<string, string | number | boolean | null | Id<"_storage">>
        | undefined) ?? {};
    const existingPhoto = existingAthleteSection.photo;
    const incomingPhoto = incomingAthleteSection.photo;

    // Keep an already uploaded photo when running payment-only migrations.
    const mergedFormData = {
      ...(application?.formData ?? {}),
      ...args.formData,
      athlete: {
        ...existingAthleteSection,
        ...incomingAthleteSection,
        ...(existingPhoto !== undefined &&
        (incomingPhoto === null || incomingPhoto === undefined)
          ? { photo: existingPhoto }
          : {}),
      },
    };

    if (!application) {
      const applicationId = await ctx.db.insert("applications", {
        userId: args.userId,
        organizationId: args.organizationId,
        formTemplateId: args.formTemplateId,
        formTemplateVersion: args.formTemplateVersion,
        applicationCode: args.applicationCode,
        status: args.status,
        formData: mergedFormData,
        ...(args.reviewedBy !== undefined
          ? { reviewedBy: args.reviewedBy }
          : {}),
        ...(args.reviewedAt !== undefined
          ? { reviewedAt: args.reviewedAt }
          : {}),
      });
      application = await ctx.db.get(applicationId);
      applicationCreated = true;
    } else {
      await ctx.db.patch(application._id, {
        userId: args.userId,
        organizationId: args.organizationId,
        formTemplateId: args.formTemplateId,
        formTemplateVersion: args.formTemplateVersion,
        status: args.status,
        formData: mergedFormData,
        ...(args.reviewedBy !== undefined
          ? { reviewedBy: args.reviewedBy }
          : {}),
        ...(args.reviewedAt !== undefined
          ? { reviewedAt: args.reviewedAt }
          : {}),
      });
      applicationUpdated = true;
    }

    if (!application) {
      throw new Error("Failed to upsert application");
    }

    await upsertLegacyMapping(ctx, {
      source: args.source,
      entityType: "application",
      legacyId: args.legacyApplicationId,
      convexId: application._id,
    });

    const affectedApplicationIds = new Set<Id<"applications">>([
      application._id,
    ]);
    let feesCreated = 0;
    let feesUpdated = 0;
    let transactionsCreated = 0;
    let transactionsUpdated = 0;
    let transactionsDeleted = 0;

    for (const payment of args.payments) {
      const totalAmount = clampMoney(payment.totalAmountCents);
      const dueAmount = Math.min(
        totalAmount,
        clampMoney(payment.dueAmountCents),
      );
      const paidAmount = Math.max(0, totalAmount - dueAmount);
      const feeStatus = toFeeStatus(totalAmount, paidAmount);
      const feeLegacyId = payment.legacyPaymentId;

      const feeMapping = await getLegacyMapping(
        ctx,
        args.source,
        "fee",
        feeLegacyId,
      );

      let fee = feeMapping
        ? await ctx.db.get(feeMapping.convexId as Id<"fees">)
        : null;

      if (fee) {
        affectedApplicationIds.add(fee.applicationId);
        await ctx.db.patch(fee._id, {
          applicationId: application._id,
          name: payment.name,
          ...(payment.description !== undefined
            ? { description: payment.description }
            : {}),
          totalAmount,
          downPaymentPercent: clampPercent(payment.downPaymentPercent),
          isRefundable: payment.isRefundable,
          isIncluded: payment.isIncluded,
          isRequired: payment.isRequired,
          status: feeStatus,
          paidAmount,
          ...(paidAmount > 0
            ? { paidAt: payment.updatedAt ?? payment.createdAt }
            : {}),
          createdBy: args.actorUserId,
          createdAt: payment.createdAt,
        });
        feesUpdated += 1;
      } else {
        const feeId = await ctx.db.insert("fees", {
          applicationId: application._id,
          name: payment.name,
          ...(payment.description !== undefined
            ? { description: payment.description }
            : {}),
          totalAmount,
          downPaymentPercent: clampPercent(payment.downPaymentPercent),
          isRefundable: payment.isRefundable,
          isIncluded: payment.isIncluded,
          isDefault: false,
          isRequired: payment.isRequired,
          status: feeStatus,
          paidAmount,
          createdAt: payment.createdAt,
          ...(paidAmount > 0
            ? { paidAt: payment.updatedAt ?? payment.createdAt }
            : {}),
          createdBy: args.actorUserId,
        });
        fee = await ctx.db.get(feeId);
        feesCreated += 1;
      }

      if (!fee) {
        throw new Error(
          `Failed to upsert fee for legacy payment ${feeLegacyId}`,
        );
      }

      await upsertLegacyMapping(ctx, {
        source: args.source,
        entityType: "fee",
        legacyId: feeLegacyId,
        convexId: fee._id,
      });

      const transactionMapping = await getLegacyMapping(
        ctx,
        args.source,
        "transaction",
        feeLegacyId,
      );
      const existingTransaction = transactionMapping
        ? await ctx.db.get(transactionMapping.convexId as Id<"transactions">)
        : null;

      if (paidAmount > 0) {
        const reference =
          payment.reference ??
          `${feeLegacyId}-${payment.legacyMethod ?? "legacy"}-cash`;

        if (existingTransaction) {
          await ctx.db.patch(existingTransaction._id, {
            applicationId: application._id,
            feeId: fee._id,
            amount: paidAmount,
            method: "cash",
            status: "completed",
            reference,
            registeredBy: args.actorUserId,
            createdAt: payment.createdAt,
            completedAt: payment.updatedAt ?? payment.createdAt,
          });
          transactionsUpdated += 1;
        } else {
          const transactionId = await ctx.db.insert("transactions", {
            applicationId: application._id,
            feeId: fee._id,
            amount: paidAmount,
            method: "cash",
            status: "completed",
            reference,
            registeredBy: args.actorUserId,
            createdAt: payment.createdAt,
            completedAt: payment.updatedAt ?? payment.createdAt,
          });
          await upsertLegacyMapping(ctx, {
            source: args.source,
            entityType: "transaction",
            legacyId: feeLegacyId,
            convexId: transactionId,
          });
          transactionsCreated += 1;
        }
      } else if (existingTransaction && transactionMapping) {
        await ctx.db.delete(existingTransaction._id);
        await ctx.db.delete(transactionMapping._id);
        transactionsDeleted += 1;
      }
    }

    for (const applicationId of affectedApplicationIds) {
      await syncApplicationFeeSummary(ctx, applicationId);
    }

    return {
      applicationId: application._id,
      applicationCreated,
      applicationUpdated,
      feesCreated,
      feesUpdated,
      transactionsCreated,
      transactionsUpdated,
      transactionsDeleted,
    };
  },
});

export const upsertApplicationPhoto = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
    legacyApplicationId: v.string(),
    applicationId: v.id("applications"),
    storageId: v.id("_storage"),
    legacyPicturePath: v.optional(v.string()),
  },
  returns: v.object({
    applicationId: v.id("applications"),
    mappingCreated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      throw new Error("Application not found");
    }

    const nextLegacySection = {
      ...(application.formData.legacy ?? {}),
      legacyPicturePath: args.legacyPicturePath ?? null,
    };

    const nextAthleteSection = {
      ...(application.formData.athlete ?? {}),
      photo: args.storageId,
    };

    await ctx.db.patch(application._id, {
      formData: {
        ...application.formData,
        legacy: nextLegacySection,
        athlete: nextAthleteSection,
      },
    });

    const mapping = await upsertLegacyMapping(ctx, {
      source: args.source,
      entityType: "photo",
      legacyId: args.legacyApplicationId,
      convexId: args.storageId,
    });

    return {
      applicationId: application._id,
      mappingCreated: mapping.created,
    };
  },
});

export const upsertApplicationDocument = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
    legacyDocumentId: v.string(),
    applicationId: v.id("applications"),
    actorUserId: v.id("users"),
    documentTypeId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    uploadedAt: v.number(),
    isRequired: v.optional(v.boolean()),
  },
  returns: v.object({
    documentId: v.id("applicationDocuments"),
    documentCreated: v.boolean(),
    documentUpdated: v.boolean(),
    mappingCreated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const [application, actor] = await Promise.all([
      ctx.db.get(args.applicationId),
      ctx.db.get(args.actorUserId),
    ]);

    if (!application) {
      throw new Error("Application not found");
    }
    if (!actor) {
      throw new Error("Actor user not found");
    }

    const mapping = await getLegacyMapping(
      ctx,
      args.source,
      "document",
      args.legacyDocumentId,
    );

    let document = mapping
      ? await ctx.db.get(mapping.convexId as Id<"applicationDocuments">)
      : null;

    if (!document) {
      document = await ctx.db
        .query("applicationDocuments")
        .withIndex("byApplicationAndType", (q) =>
          q
            .eq("applicationId", args.applicationId)
            .eq("documentTypeId", args.documentTypeId),
        )
        .unique();
    }

    let documentCreated = false;
    let documentUpdated = false;

    if (document) {
      await ctx.db.patch(document._id, {
        applicationId: args.applicationId,
        documentTypeId: args.documentTypeId,
        name: args.name,
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        storageId: args.storageId,
        fileName: args.fileName,
        contentType: args.contentType,
        fileSize: args.fileSize,
        uploadedBy: args.actorUserId,
        uploadedAt: args.uploadedAt,
        status: "pending",
      });
      documentUpdated = true;
    } else {
      const documentId = await ctx.db.insert("applicationDocuments", {
        applicationId: args.applicationId,
        documentTypeId: args.documentTypeId,
        name: args.name,
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        storageId: args.storageId,
        fileName: args.fileName,
        contentType: args.contentType,
        fileSize: args.fileSize,
        status: "pending",
        uploadedBy: args.actorUserId,
        uploadedAt: args.uploadedAt,
      });
      document = await ctx.db.get(documentId);
      documentCreated = true;
    }

    if (!document) {
      throw new Error("Failed to upsert application document");
    }

    if (args.isRequired !== undefined) {
      const existingConfig = await ctx.db
        .query("applicationDocumentConfig")
        .withIndex("byApplicationAndType", (q) =>
          q
            .eq("applicationId", args.applicationId)
            .eq("documentTypeId", args.documentTypeId),
        )
        .unique();

      const visibility = args.isRequired ? "required" : "optional";
      if (existingConfig) {
        await ctx.db.patch(existingConfig._id, {
          visibility,
          updatedAt: Date.now(),
          updatedBy: args.actorUserId,
        });
      } else {
        await ctx.db.insert("applicationDocumentConfig", {
          applicationId: args.applicationId,
          documentTypeId: args.documentTypeId,
          visibility,
          updatedAt: Date.now(),
          updatedBy: args.actorUserId,
        });
      }
    }

    const mappingUpsert = await upsertLegacyMapping(ctx, {
      source: args.source,
      entityType: "document",
      legacyId: args.legacyDocumentId,
      convexId: document._id,
    });

    return {
      documentId: document._id,
      documentCreated,
      documentUpdated,
      mappingCreated: mappingUpsert.created,
    };
  },
});

export const getLegacyMappingById = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
    entityType: legacyEntityType,
    legacyId: v.string(),
  },
  returns: v.union(
    v.object({
      convexId: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);
    const mapping = await getLegacyMapping(
      ctx,
      args.source,
      args.entityType,
      args.legacyId,
    );
    if (!mapping) {
      return null;
    }
    return {
      convexId: mapping.convexId,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    };
  },
});

export const getApplicationFinancialSnapshotByLegacyId = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
    legacyApplicationId: v.string(),
  },
  returns: v.union(
    v.object({
      applicationId: v.id("applications"),
      applicationCode: v.string(),
      status: applicationStatus,
      feeCount: v.number(),
      transactionCount: v.number(),
      totalAmount: v.number(),
      totalPaid: v.number(),
      totalPending: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const mapping = await getLegacyMapping(
      ctx,
      args.source,
      "application",
      args.legacyApplicationId,
    );
    if (!mapping) {
      return null;
    }

    const application = await ctx.db.get(
      mapping.convexId as Id<"applications">,
    );
    if (!application) {
      return null;
    }

    const [fees, transactions] = await Promise.all([
      ctx.db
        .query("fees")
        .withIndex("byApplication", (q) =>
          q.eq("applicationId", application._id),
        )
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("byApplication", (q) =>
          q.eq("applicationId", application._id),
        )
        .collect(),
    ]);

    const totalAmount = fees.reduce((sum, fee) => sum + fee.totalAmount, 0);
    const totalPaid = fees.reduce((sum, fee) => sum + fee.paidAmount, 0);

    return {
      applicationId: application._id,
      applicationCode: application.applicationCode,
      status: application.status,
      feeCount: fees.length,
      transactionCount: transactions.length,
      totalAmount,
      totalPaid,
      totalPending: totalAmount - totalPaid,
    };
  },
});

export const getUserSyncSummary = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
  },
  returns: v.object({
    totalUsers: v.number(),
    activeUsers: v.number(),
    syntheticUsers: v.number(),
    totalMemberships: v.number(),
    syntheticMemberships: v.number(),
    accountMappings: v.number(),
    mappedUsersFound: v.number(),
    mappedSyntheticUsers: v.number(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const [users, memberships, accountMappings] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("organizationMembers").collect(),
      ctx.db
        .query("legacyMigrationMappings")
        .withIndex("bySourceAndEntityType", (q) =>
          q.eq("source", args.source).eq("entityType", "account"),
        )
        .collect(),
    ]);

    const syntheticUserPrefix = "legacy_synth_";
    const syntheticMembershipPrefixes = ["synthetic_", "synthetic:"];

    let mappedUsersFound = 0;
    let mappedSyntheticUsers = 0;
    for (const mapping of accountMappings) {
      const user = await ctx.db.get(mapping.convexId as Id<"users">);
      if (!user) continue;
      mappedUsersFound += 1;
      if (user.clerkId.startsWith(syntheticUserPrefix)) {
        mappedSyntheticUsers += 1;
      }
    }

    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.isActive).length,
      syntheticUsers: users.filter((u) =>
        u.clerkId.startsWith(syntheticUserPrefix),
      ).length,
      totalMemberships: memberships.length,
      syntheticMemberships: memberships.filter((m) =>
        syntheticMembershipPrefixes.some((prefix) =>
          m.clerkMembershipId.startsWith(prefix),
        ),
      ).length,
      accountMappings: accountMappings.length,
      mappedUsersFound,
      mappedSyntheticUsers,
    };
  },
});

export const getSourceSummary = mutation({
  args: {
    secret: v.string(),
    source: v.string(),
  },
  returns: v.object({
    accountMappings: v.number(),
    membershipMappings: v.number(),
    applicationMappings: v.number(),
    feeMappings: v.number(),
    transactionMappings: v.number(),
    photoMappings: v.number(),
    documentMappings: v.number(),
    applicationsFound: v.number(),
    feesFound: v.number(),
    transactionsFound: v.number(),
    totalFeeAmount: v.number(),
    totalFeePaid: v.number(),
    totalFeeDue: v.number(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const loadByType = async (
      entityType:
        | "account"
        | "membership"
        | "application"
        | "fee"
        | "transaction"
        | "photo"
        | "document",
    ) =>
      await ctx.db
        .query("legacyMigrationMappings")
        .withIndex("bySourceAndEntityType", (q) =>
          q.eq("source", args.source).eq("entityType", entityType),
        )
        .collect();

    const [
      accountMappings,
      membershipMappings,
      applicationMappings,
      feeMappings,
      transactionMappings,
      photoMappings,
      documentMappings,
    ] = await Promise.all([
      loadByType("account"),
      loadByType("membership"),
      loadByType("application"),
      loadByType("fee"),
      loadByType("transaction"),
      loadByType("photo"),
      loadByType("document"),
    ]);

    let applicationsFound = 0;
    for (const mapping of applicationMappings) {
      const application = await ctx.db.get(
        mapping.convexId as Id<"applications">,
      );
      if (application) applicationsFound += 1;
    }

    let feesFound = 0;
    let totalFeeAmount = 0;
    let totalFeePaid = 0;
    for (const mapping of feeMappings) {
      const fee = await ctx.db.get(mapping.convexId as Id<"fees">);
      if (!fee) continue;
      feesFound += 1;
      totalFeeAmount += fee.totalAmount;
      totalFeePaid += fee.paidAmount;
    }

    let transactionsFound = 0;
    for (const mapping of transactionMappings) {
      const transaction = await ctx.db.get(
        mapping.convexId as Id<"transactions">,
      );
      if (transaction) transactionsFound += 1;
    }

    return {
      accountMappings: accountMappings.length,
      membershipMappings: membershipMappings.length,
      applicationMappings: applicationMappings.length,
      feeMappings: feeMappings.length,
      transactionMappings: transactionMappings.length,
      photoMappings: photoMappings.length,
      documentMappings: documentMappings.length,
      applicationsFound,
      feesFound,
      transactionsFound,
      totalFeeAmount,
      totalFeePaid,
      totalFeeDue: totalFeeAmount - totalFeePaid,
    };
  },
});

export const cleanupOrphanedStorage = mutation({
  args: {
    secret: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    totalStorageFiles: v.number(),
    referencedStorageFiles: v.number(),
    referencedFromApplications: v.number(),
    referencedFromDocuments: v.number(),
    referencedFromPhotoMappings: v.number(),
    orphanedStorageFiles: v.number(),
    attemptedDeletions: v.number(),
    deletedStorageFiles: v.number(),
    hasMore: v.boolean(),
    sampleOrphanStorageIds: v.array(v.id("_storage")),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const dryRun = args.dryRun ?? true;
    const rawLimit = Math.trunc(args.limit ?? 200);
    const limit = Math.min(2000, Math.max(1, rawLimit));

    const [storageFiles, applications, applicationDocuments, legacyMappings] =
      await Promise.all([
        ctx.db.system.query("_storage").collect(),
        ctx.db.query("applications").collect(),
        ctx.db.query("applicationDocuments").collect(),
        ctx.db.query("legacyMigrationMappings").collect(),
      ]);

    const knownStorageIds = new Set<Id<"_storage">>(
      storageFiles.map((file) => file._id),
    );

    const referencedStorageIds = new Set<Id<"_storage">>();
    let referencedFromApplications = 0;
    let referencedFromDocuments = 0;
    let referencedFromPhotoMappings = 0;

    for (const application of applications) {
      for (const section of Object.values(application.formData)) {
        if (!section || typeof section !== "object") {
          continue;
        }
        for (const value of Object.values(section)) {
          if (typeof value !== "string") {
            continue;
          }
          const candidate = value as Id<"_storage">;
          if (!knownStorageIds.has(candidate)) {
            continue;
          }
          if (!referencedStorageIds.has(candidate)) {
            referencedFromApplications += 1;
          }
          referencedStorageIds.add(candidate);
        }
      }
    }

    for (const document of applicationDocuments) {
      const candidate = document.storageId;
      if (!knownStorageIds.has(candidate)) {
        continue;
      }
      if (!referencedStorageIds.has(candidate)) {
        referencedFromDocuments += 1;
      }
      referencedStorageIds.add(candidate);
    }

    for (const mapping of legacyMappings) {
      if (mapping.entityType !== "photo") {
        continue;
      }
      const candidate = mapping.convexId as Id<"_storage">;
      if (!knownStorageIds.has(candidate)) {
        continue;
      }
      if (!referencedStorageIds.has(candidate)) {
        referencedFromPhotoMappings += 1;
      }
      referencedStorageIds.add(candidate);
    }

    const orphanedStorageIds = storageFiles
      .map((file) => file._id)
      .filter((storageId) => !referencedStorageIds.has(storageId));

    const idsToDelete = orphanedStorageIds.slice(0, limit);
    let deletedStorageFiles = 0;

    if (!dryRun) {
      for (const storageId of idsToDelete) {
        await ctx.storage.delete(storageId);
        deletedStorageFiles += 1;
      }
    }

    return {
      totalStorageFiles: storageFiles.length,
      referencedStorageFiles: referencedStorageIds.size,
      referencedFromApplications,
      referencedFromDocuments,
      referencedFromPhotoMappings,
      orphanedStorageFiles: orphanedStorageIds.length,
      attemptedDeletions: idsToDelete.length,
      deletedStorageFiles,
      hasMore: orphanedStorageIds.length > idsToDelete.length,
      sampleOrphanStorageIds: orphanedStorageIds.slice(0, 20),
    };
  },
});

export const auditApplicationPhotos = mutation({
  args: {
    secret: v.string(),
  },
  returns: v.object({
    totalApplications: v.number(),
    totalPhotos: v.number(),
    rows: v.array(
      v.object({
        applicationId: v.id("applications"),
        applicationCode: v.string(),
        name: v.string(),
        source: v.union(
          v.literal("applicant.photoStorageId"),
          v.literal("formData.athlete.photo"),
        ),
        storageId: v.id("_storage"),
        metadataContentType: v.union(v.string(), v.null()),
        metadataSize: v.union(v.number(), v.null()),
        url: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const [applications, storageFiles] = await Promise.all([
      ctx.db.query("applications").collect(),
      ctx.db.system.query("_storage").collect(),
    ]);
    const storageFileMap = new Map(
      storageFiles.map((storageFile) => [storageFile._id, storageFile]),
    );
    const rows = [];

    for (const application of applications) {
      const applicantPhotoStorageId = application.applicant?.photoStorageId;
      const legacyPhotoStorageId = getLegacyPhotoStorageId(
        application.formData,
      );
      const storageId = applicantPhotoStorageId ?? legacyPhotoStorageId;

      if (!storageId) {
        continue;
      }

      const storageFile = storageFileMap.get(storageId);
      const athlete = application.formData.athlete ?? {};
      const firstName =
        application.applicant?.firstName ??
        (typeof athlete.firstName === "string" ? athlete.firstName : "");
      const lastName =
        application.applicant?.lastName ??
        (typeof athlete.lastName === "string" ? athlete.lastName : "");

      rows.push({
        applicationId: application._id,
        applicationCode: application.applicationCode,
        name: `${firstName} ${lastName}`.trim(),
        source: applicantPhotoStorageId
          ? ("applicant.photoStorageId" as const)
          : ("formData.athlete.photo" as const),
        storageId,
        metadataContentType: storageFile?.contentType ?? null,
        metadataSize: storageFile?.size ?? null,
        url: await ctx.storage.getUrl(storageId),
      });
    }

    return {
      totalApplications: applications.length,
      totalPhotos: rows.length,
      rows,
    };
  },
});

export const replaceApplicationPhotoStorage = mutation({
  args: {
    secret: v.string(),
    applicationId: v.id("applications"),
    oldStorageId: v.id("_storage"),
    newStorageId: v.id("_storage"),
  },
  returns: v.object({
    applicationId: v.id("applications"),
    applicantUpdated: v.boolean(),
    formDataUpdated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      throw new Error("Application not found");
    }

    const applicantHasOldPhoto =
      application.applicant?.photoStorageId === args.oldStorageId;
    const legacyHasOldPhoto =
      getLegacyPhotoStorageId(application.formData) === args.oldStorageId;

    if (!applicantHasOldPhoto && !legacyHasOldPhoto) {
      throw new Error("Current application photo does not match oldStorageId");
    }

    await ctx.db.patch(application._id, {
      ...(applicantHasOldPhoto && application.applicant
        ? {
            applicant: {
              ...application.applicant,
              photoStorageId: args.newStorageId,
            },
          }
        : {}),
      ...(legacyHasOldPhoto
        ? {
            formData: {
              ...application.formData,
              athlete: {
                ...(application.formData.athlete ?? {}),
                photo: args.newStorageId,
              },
            },
          }
        : {}),
    });

    return {
      applicationId: application._id,
      applicantUpdated: applicantHasOldPhoto,
      formDataUpdated: legacyHasOldPhoto,
    };
  },
});

export const backfillApplicationPrograms = mutation({
  args: {
    secret: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    totalApplications: v.number(),
    attemptedUpdates: v.number(),
    updatedApplications: v.number(),
    byStatus: v.record(v.string(), v.number()),
    rows: v.array(
      v.object({
        applicationId: v.id("applications"),
        applicationCode: v.string(),
        currentName: v.string(),
        targetName: v.optional(v.string()),
        targetProgramId: v.optional(v.id("programs")),
        status: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const dryRun = args.dryRun ?? true;
    const limit = Math.min(500, Math.max(1, Math.trunc(args.limit ?? 50)));
    const [applications, programs] = await Promise.all([
      ctx.db.query("applications").collect(),
      ctx.db.query("programs").collect(),
    ]);
    const programById = new Map(
      programs.map((program) => [program._id, program]),
    );
    const programsByOrgAndKey = new Map<
      string,
      Array<(typeof programs)[number]>
    >();

    for (const program of programs) {
      if (program.isDraft || program.isActive === false) {
        continue;
      }
      const key = `${program.organizationId}:${normalizeProgramKey(program.name)}`;
      programsByOrgAndKey.set(key, [
        ...(programsByOrgAndKey.get(key) ?? []),
        program,
      ]);
    }

    const rows = [];
    const byStatus: Record<string, number> = {};
    let attemptedUpdates = 0;
    let updatedApplications = 0;

    for (const application of applications) {
      const currentName = (
        application.programSnapshot?.name ??
        (typeof application.formData.athlete?.program === "string"
          ? application.formData.athlete.program
          : "")
      ).trim();
      let status = "skipped-already-canonical";
      let targetProgram = application.programId
        ? programById.get(application.programId)
        : undefined;

      if (!currentName) {
        status = "skipped-missing-program";
      }

      if (status === "skipped-already-canonical" && !targetProgram) {
        const key = `${application.organizationId}:${normalizeProgramKey(currentName)}`;
        const matches = programsByOrgAndKey.get(key) ?? [];
        if (matches.length === 1) {
          targetProgram = matches[0];
        } else {
          status =
            matches.length > 1
              ? "skipped-ambiguous-program"
              : "skipped-no-canonical-program";
        }
      }

      const nextSnapshot = targetProgram
        ? {
            name: targetProgram.name,
            ...(targetProgram.iconKey
              ? { iconKey: targetProgram.iconKey }
              : {}),
          }
        : undefined;
      const needsUpdate = Boolean(
        targetProgram &&
        nextSnapshot &&
        (application.programId !== targetProgram._id ||
          application.programSnapshot?.name !== nextSnapshot.name ||
          application.programSnapshot?.iconKey !== nextSnapshot.iconKey),
      );

      if (needsUpdate && targetProgram && nextSnapshot) {
        status = dryRun ? "would-update" : "updated";
        attemptedUpdates += 1;

        if (!dryRun) {
          await ctx.db.patch(application._id, {
            programId: targetProgram._id,
            programSnapshot: nextSnapshot,
          });
          updatedApplications += 1;
        }
      }

      byStatus[status] = (byStatus[status] ?? 0) + 1;
      rows.push({
        applicationId: application._id,
        applicationCode: application.applicationCode,
        currentName,
        ...(targetProgram
          ? {
              targetName: targetProgram.name,
              targetProgramId: targetProgram._id,
            }
          : {}),
        status,
      });

      if (attemptedUpdates >= limit) {
        break;
      }
    }

    return {
      dryRun,
      totalApplications: applications.length,
      attemptedUpdates,
      updatedApplications,
      byStatus,
      rows,
    };
  },
});

export const backfillSpecialApplicationPrograms = mutation({
  args: {
    secret: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    totalApplications: v.number(),
    attemptedUpdates: v.number(),
    updatedApplications: v.number(),
    byStatus: v.record(v.string(), v.number()),
    rows: v.array(
      v.object({
        applicationId: v.id("applications"),
        applicationCode: v.string(),
        currentName: v.string(),
        targetName: v.optional(v.string()),
        targetProgramId: v.optional(v.id("programs")),
        status: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    const dryRun = args.dryRun ?? true;
    const limit = Math.min(500, Math.max(1, Math.trunc(args.limit ?? 50)));
    const [applications, programs] = await Promise.all([
      ctx.db.query("applications").collect(),
      ctx.db.query("programs").collect(),
    ]);
    const programsByOrgAndKey = new Map<
      string,
      Array<(typeof programs)[number]>
    >();

    for (const program of programs) {
      if (program.isDraft || program.isActive === false) {
        continue;
      }
      const key = `${program.organizationId}:${normalizeProgramKey(program.name)}`;
      programsByOrgAndKey.set(key, [
        ...(programsByOrgAndKey.get(key) ?? []),
        program,
      ]);
    }

    const rows = [];
    const byStatus: Record<string, number> = {};
    let attemptedUpdates = 0;
    let updatedApplications = 0;

    for (const application of applications) {
      const currentName = (
        application.programSnapshot?.name ??
        (typeof application.formData.athlete?.program === "string"
          ? application.formData.athlete.program
          : "")
      ).trim();
      const targetProgramName =
        specialApplicationProgramMappings[normalizeProgramKey(currentName)];
      let status = targetProgramName
        ? "skipped-already-canonical"
        : "skipped-not-special-program";
      let targetProgram: (typeof programs)[number] | undefined;

      if (targetProgramName) {
        const key = `${application.organizationId}:${normalizeProgramKey(targetProgramName)}`;
        const matches = programsByOrgAndKey.get(key) ?? [];

        if (matches.length === 1) {
          targetProgram = matches[0];
        } else {
          status =
            matches.length > 1
              ? "skipped-ambiguous-target-program"
              : "skipped-missing-target-program";
        }
      }

      const nextSnapshot = targetProgram
        ? {
            name: targetProgram.name,
            ...(targetProgram.iconKey
              ? { iconKey: targetProgram.iconKey }
              : {}),
          }
        : undefined;
      const needsUpdate = Boolean(
        targetProgram &&
        nextSnapshot &&
        (application.programId !== targetProgram._id ||
          application.programSnapshot?.name !== nextSnapshot.name ||
          application.programSnapshot?.iconKey !== nextSnapshot.iconKey),
      );

      if (needsUpdate && targetProgram && nextSnapshot) {
        status = dryRun ? "would-update" : "updated";
        attemptedUpdates += 1;

        if (!dryRun) {
          await ctx.db.patch(application._id, {
            programId: targetProgram._id,
            programSnapshot: nextSnapshot,
          });
          updatedApplications += 1;
        }
      }

      if (targetProgramName || status !== "skipped-not-special-program") {
        byStatus[status] = (byStatus[status] ?? 0) + 1;
        rows.push({
          applicationId: application._id,
          applicationCode: application.applicationCode,
          currentName,
          ...(targetProgramName ? { targetName: targetProgramName } : {}),
          ...(targetProgram ? { targetProgramId: targetProgram._id } : {}),
          status,
        });
      }

      if (attemptedUpdates >= limit) {
        break;
      }
    }

    return {
      dryRun,
      totalApplications: applications.length,
      attemptedUpdates,
      updatedApplications,
      byStatus,
      rows,
    };
  },
});
