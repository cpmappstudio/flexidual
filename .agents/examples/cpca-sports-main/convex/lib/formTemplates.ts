import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { cloneTemplateDocumentsToTemplate } from "./defaultDocuments";
import { cloneTemplatePaymentsToTemplate } from "./defaultPayments";

export const templateSectionValidator = v.object({
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
});

export async function getNextTemplateVersion(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
) {
  const existingTemplates = await ctx.db
    .query("formTemplates")
    .withIndex("byOrganization", (q) => q.eq("organizationId", organizationId))
    .collect();

  return (
    existingTemplates.reduce(
      (maxVersion, template) => Math.max(maxVersion, template.version),
      0,
    ) + 1
  );
}

export async function duplicateTemplateAsDraft(
  ctx: MutationCtx,
  params: {
    template: Doc<"formTemplates">;
    userId: Id<"users">;
  },
) {
  const nextTemplateId = await ctx.db.insert("formTemplates", {
    organizationId: params.template.organizationId,
    version: await getNextTemplateVersion(ctx, params.template.organizationId),
    name: params.template.name,
    description: params.template.description,
    formDefinition: params.template.formDefinition,
    sections: params.template.sections,
    isPublished: false,
  });

  await cloneTemplateDocumentsToTemplate(ctx, {
    sourceTemplateId: params.template._id,
    targetTemplateId: nextTemplateId,
    userId: params.userId,
  });
  await cloneTemplatePaymentsToTemplate(ctx, {
    sourceTemplateId: params.template._id,
    targetTemplateId: nextTemplateId,
    userId: params.userId,
  });

  return nextTemplateId;
}
