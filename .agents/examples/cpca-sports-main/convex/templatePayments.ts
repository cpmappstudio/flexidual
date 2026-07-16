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
import {
  buildPaymentDefaultKey,
  createRecurringPaymentDefaultSeries,
  recurringUpdateScopeValidator,
  removePaymentDefaultFee,
  updatePaymentDefaultFee,
  updateRecurringPaymentDefaultSeries,
  validatePaymentDefaultFeeArgs,
} from "./lib/paymentDefaultsRuntime";

const templateFeeConfigValidator = v.object({
  _id: v.id("templateFeeConfig"),
  _creationTime: v.number(),
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
});

const templatePaymentMutationResultValidator = v.object({
  templateId: v.id("formTemplates"),
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

async function getEditableTemplateFeeConfig(
  ctx: MutationCtx,
  feeId: Id<"templateFeeConfig">,
  userId: Id<"users">,
) {
  const fee = await ctx.db.get(feeId);
  if (!fee) {
    throw new Error("Fee not found");
  }

  const editableTemplateId = await getEditableTemplateId(
    ctx,
    fee.templateId,
    userId,
  );

  if (editableTemplateId === fee.templateId) {
    return {
      templateId: editableTemplateId,
      fee,
    };
  }

  const editableFee = await ctx.db
    .query("templateFeeConfig")
    .withIndex("byTemplateAndFeeKey", (q) =>
      q.eq("templateId", editableTemplateId).eq("feeKey", fee.feeKey),
    )
    .unique();

  if (!editableFee) {
    throw new Error("Fee not found");
  }

  return {
    templateId: editableTemplateId,
    fee: editableFee,
  };
}

export const getByTemplate = query({
  args: { templateId: v.id("formTemplates") },
  returns: v.array(templateFeeConfigValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyTemplateAdminAccess(ctx, args.templateId, user._id);

    return await ctx.db
      .query("templateFeeConfig")
      .withIndex("byTemplate", (q) => q.eq("templateId", args.templateId))
      .collect();
  },
});

export const createFee = mutation({
  args: {
    templateId: v.id("formTemplates"),
    name: v.string(),
    totalAmount: v.number(),
    downPaymentPercent: v.number(),
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
  },
  returns: templatePaymentMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const name = validatePaymentDefaultFeeArgs(args);

    const editableTemplateId = await getEditableTemplateId(
      ctx,
      args.templateId,
      user._id,
    );

    await ctx.db.insert("templateFeeConfig", {
      templateId: editableTemplateId,
      feeKey: buildPaymentDefaultKey("template_fee", name),
      name,
      totalAmount: args.totalAmount,
      downPaymentPercent: args.downPaymentPercent,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
      createdAt: Date.now(),
      createdBy: user._id,
    });

    return { templateId: editableTemplateId };
  },
});

export const createRecurringPlan = mutation({
  args: {
    templateId: v.id("formTemplates"),
    name: v.string(),
    totalAmount: v.number(),
    downPaymentAmount: v.optional(v.number()),
    installmentCount: v.number(),
    dueDayOfMonth: v.number(),
    timezone: v.string(),
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
  },
  returns: templatePaymentMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const editableTemplateId = await getEditableTemplateId(
      ctx,
      args.templateId,
      user._id,
    );

    await createRecurringPaymentDefaultSeries(ctx, {
      feeTable: "templateFeeConfig",
      planTable: "templateRecurringFeeConfig",
      ownerField: "templateId",
      ownerId: editableTemplateId,
      planKeyPrefix: "template_plan",
      userId: user._id,
      name: args.name,
      totalAmount: args.totalAmount,
      downPaymentAmount: args.downPaymentAmount,
      installmentCount: args.installmentCount,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
    });

    return { templateId: editableTemplateId };
  },
});

export const removeFee = mutation({
  args: {
    feeId: v.id("templateFeeConfig"),
    scope: v.optional(recurringUpdateScopeValidator),
  },
  returns: templatePaymentMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const { templateId, fee } = await getEditableTemplateFeeConfig(
      ctx,
      args.feeId,
      user._id,
    );
    await removePaymentDefaultFee(ctx, {
      feeTable: "templateFeeConfig",
      fee,
      scope: args.scope,
    });

    return { templateId };
  },
});

export const updateFee = mutation({
  args: {
    feeId: v.id("templateFeeConfig"),
    name: v.string(),
    totalAmount: v.optional(v.number()),
  },
  returns: templatePaymentMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const { templateId, fee } = await getEditableTemplateFeeConfig(
      ctx,
      args.feeId,
      user._id,
    );
    await updatePaymentDefaultFee(ctx, {
      fee,
      name: args.name,
      totalAmount: args.totalAmount,
    });
    return { templateId };
  },
});

export const updateRecurringSeries = mutation({
  args: {
    feeId: v.id("templateFeeConfig"),
    name: v.string(),
    totalAmount: v.number(),
    installmentCount: v.number(),
    dueDayOfMonth: v.number(),
    timezone: v.string(),
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
    installmentAmounts: v.optional(v.array(v.number())),
  },
  returns: templatePaymentMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const { templateId, fee } = await getEditableTemplateFeeConfig(
      ctx,
      args.feeId,
      user._id,
    );

    if (!fee.recurringPlanId) {
      throw new Error("Fee is not part of a recurring plan");
    }

    const recurringPlan = await ctx.db.get(fee.recurringPlanId);
    if (!recurringPlan) {
      throw new Error("Recurring plan not found");
    }
    await updateRecurringPaymentDefaultSeries(ctx, {
      feeTable: "templateFeeConfig",
      ownerField: "templateId",
      ownerId: templateId,
      userId: user._id,
      fee: {
        _id: fee._id,
        recurringPlanId: fee.recurringPlanId,
        installmentIndex: fee.installmentIndex,
      },
      recurringPlan,
      name: args.name,
      totalAmount: args.totalAmount,
      installmentCount: args.installmentCount,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
      installmentAmounts: args.installmentAmounts,
    });
    return { templateId };
  },
});
