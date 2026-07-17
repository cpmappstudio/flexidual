"use client";

import { startTransition, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { ROUTES } from "@/lib/navigation/routes";
import { InlineHeaderEditField } from "@/components/common/inline-header-edit-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FormDefaultsEditorShell,
  type FormDefaultsEditorTab,
} from "@/components/sections/shell/form-defaults/form-defaults-editor-shell";
import { useFormDefaultsEditorState } from "@/components/sections/shell/form-defaults/use-form-defaults-editor-state";
import { ProgramFormBuilder } from "@/components/sections/shell/programs/create/form-builder/program-form-builder";
import { createProgramFormCopy } from "@/components/sections/shell/programs/create/form-builder/program-form-copy";
import { buildProgramFormDefinitionFromTemplate } from "@/components/sections/shell/programs/create/form-builder/template-definition";
import { buildTemplateSectionsFromProgramForm } from "@/components/sections/shell/programs/create/form-builder/template-sections";
import { getProgramFormFieldNameErrors } from "@/components/sections/shell/programs/create/form-builder/utils";
import { mapEditableDocumentConfigs } from "@/components/sections/shell/documents/document-default-types";
import { mapEditablePaymentDefaults } from "@/components/sections/shell/payments/defaults/payment-default-state";
import { TemplateDocuments } from "./template-documents";
import { TemplatePayments } from "./template-payments";

interface FormTemplateEditorProps {
  organizationSlug: string;
  organizationLogoUrl?: string;
  template: Doc<"formTemplates">;
}

export function FormTemplateEditor({
  organizationSlug,
  organizationLogoUrl,
  template,
}: FormTemplateEditorProps) {
  const router = useRouter();
  const t = useTranslations("Forms.template");
  const tBuilder = useTranslations("Programs.create.builder");
  const formCopy = useMemo(() => createProgramFormCopy(tBuilder), [tBuilder]);
  const tActions = useTranslations("Common.actions");
  const updateTemplate = useMutation(api.formTemplates.update);
  const liveDocumentConfigs = useQuery(api.templateDocuments.getByTemplate, {
    templateId: template._id,
  });
  const livePaymentConfigs = useQuery(api.templatePayments.getByTemplate, {
    templateId: template._id,
  });
  const [activeTab, setActiveTab] =
    useState<FormDefaultsEditorTab>("application");
  const initialFormDefinition = useMemo(
    () => buildProgramFormDefinitionFromTemplate(template, formCopy),
    [formCopy, template],
  );
  const mappedDocumentConfigs = useMemo(
    () =>
      liveDocumentConfigs === undefined
        ? undefined
        : mapEditableDocumentConfigs(
            [...liveDocumentConfigs].sort(
              (left, right) => left._creationTime - right._creationTime,
            ),
          ),
    [liveDocumentConfigs],
  );
  const mappedPaymentConfigs = useMemo(
    () =>
      livePaymentConfigs === undefined
        ? undefined
        : mapEditablePaymentDefaults(livePaymentConfigs),
    [livePaymentConfigs],
  );
  const editorState = useFormDefaultsEditorState({
    resetKey: template._id,
    initialName: template.name,
    initialDescription: template.description,
    initialFormDefinition,
    liveDocumentConfigs: mappedDocumentConfigs,
    livePaymentConfigs: mappedPaymentConfigs,
  });
  const { name, setName } = editorState;
  const { description, setDescription } = editorState;
  const { formDefinition, setFormDefinition } = editorState;
  const { documentConfigs, setDocumentConfigs } = editorState;
  const { paymentConfigs, setPaymentConfigs } = editorState;
  const { serializedFormDefinition } = editorState;
  const { savablePaymentConfigs } = editorState;
  const [isSaving, setIsSaving] = useState(false);
  const canUpdateTemplate = editorState.hasUnsavedChanges;

  const handleSave = async () => {
    const normalizedName = name.trim();
    const normalizedDescription = description.trim();

    if (!normalizedName) {
      toast.error(t("feedback.nameRequired"));
      return;
    }

    const fieldNameErrors = getProgramFormFieldNameErrors(formDefinition);
    if (Object.keys(fieldNameErrors).length > 0) {
      toast.error(t("feedback.invalidFormDefinition"));
      return;
    }

    if (!canUpdateTemplate) {
      return;
    }

    setIsSaving(true);

    try {
      const nextTemplateId = await updateTemplate({
        templateId: template._id,
        name: normalizedName,
        description: normalizedDescription || undefined,
        formDefinition: serializedFormDefinition,
        documentConfigs: documentConfigs === null ? undefined : documentConfigs,
        paymentConfigs:
          savablePaymentConfigs === null ? undefined : savablePaymentConfigs,
        sections: buildTemplateSectionsFromProgramForm(
          formDefinition,
          (index) => tBuilder("preview.stepLabel", { current: index + 1 }),
        ),
      });

      toast.success(t("feedback.saveSuccess"));

      if (nextTemplateId !== template._id) {
        startTransition(() => {
          router.replace(
            ROUTES.org.forms.detail(organizationSlug, nextTemplateId),
          );
        });
        return;
      }

      editorState.markCurrentStateAsSaved({
        name: normalizedName,
        description: normalizedDescription,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("feedback.saveError");
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <FormDefaultsEditorShell
        title={
          <div className="flex flex-wrap items-center gap-2">
            <InlineHeaderEditField
              value={name}
              fallback={t("header.nameFallback")}
              ariaLabel={t("header.editName")}
              disabled={isSaving}
              inputClassName="h-8 w-[260px] max-w-full"
              onChange={setName}
            />
            <Badge variant="secondary">
              {t("header.badge", { version: template.version })}
            </Badge>
          </div>
        }
        subtitle={
          <InlineHeaderEditField
            value={description}
            fallback={t("header.descriptionFallback")}
            ariaLabel={t("header.editDescription")}
            disabled={isSaving}
            inputClassName="h-8 w-[320px] max-w-full"
            onChange={setDescription}
          />
        }
        logoUrl={organizationLogoUrl}
        action={
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !canUpdateTemplate}
          >
            {isSaving ? tActions("saving") : t("header.updateAction")}
          </Button>
        }
        activeTab={activeTab}
        tabLabels={{
          application: t("tabs.application"),
          documents: t("tabs.documents"),
          payments: t("tabs.payments"),
        }}
        onTabChange={setActiveTab}
        applicationContent={
          <ProgramFormBuilder
            value={formDefinition}
            onChange={setFormDefinition}
          />
        }
        documentsContent={
          <TemplateDocuments
            documents={documentConfigs}
            onChange={setDocumentConfigs}
          />
        }
        paymentsContent={
          <TemplatePayments
            fees={paymentConfigs}
            onChange={setPaymentConfigs}
          />
        }
      />
    </>
  );
}
