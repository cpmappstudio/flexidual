"use client";

import { useMemo, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { InlineHeaderEditField } from "@/components/common/inline-header-edit-field";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  FormDefaultsEditorShell,
  type FormDefaultsEditorTab,
} from "@/components/sections/shell/form-defaults/form-defaults-editor-shell";
import { useFormDefaultsEditorState } from "@/components/sections/shell/form-defaults/use-form-defaults-editor-state";
import { buildProgramFormDefinitionFromTemplate } from "./form-builder/template-definition";
import { buildTemplateSectionsFromProgramForm } from "./form-builder/template-sections";
import { createProgramFormCopy } from "./form-builder/program-form-copy";
import { ProgramDocuments } from "./program-documents";
import { ProgramPayments } from "./program-payments";
import { ProgramFormBuilder } from "./form-builder/program-form-builder";
import {
  getProgramFormFieldNameErrors,
  parseProgramFormDefinition,
} from "./form-builder/utils";
import { mapEditableDocumentConfigs } from "@/components/sections/shell/documents/document-default-types";
import { mapEditablePaymentDefaults } from "@/components/sections/shell/payments/defaults/payment-default-state";
import { ProgramSaveDialog } from "./program-save-dialog";
import { ProgramUseTemplateDialog } from "./program-use-template-dialog";
import { ProgramIconPicker } from "./program-icon-picker";

interface ProgramCreateWorkspaceProps {
  initialProgram: Doc<"programs">;
  templates: Doc<"formTemplates">[];
}

export function ProgramCreateWorkspace({
  initialProgram,
  templates,
}: ProgramCreateWorkspaceProps) {
  const t = useTranslations("Programs.create");
  const tBuilder = useTranslations("Programs.create.builder");
  const formCopy = useMemo(() => createProgramFormCopy(tBuilder), [tBuilder]);
  const convex = useConvex();
  const saveProgram = useMutation(api.programs.save);
  const liveDocumentConfigs = useQuery(api.programDocuments.getByProgram, {
    programId: initialProgram._id,
  });
  const livePaymentConfigs = useQuery(api.programPayments.getByProgram, {
    programId: initialProgram._id,
  });
  const [activeTab, setActiveTab] =
    useState<FormDefaultsEditorTab>("application");
  const [iconKey, setIconKey] = useState(initialProgram.iconKey);
  const initialFormDefinition = useMemo(
    () => parseProgramFormDefinition(initialProgram.formDefinition, formCopy),
    [formCopy, initialProgram.formDefinition],
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
    resetKey: initialProgram._id,
    initialName: initialProgram.name,
    initialDescription: initialProgram.description,
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
  const [savedIconKey, setSavedIconKey] = useState(initialProgram.iconKey);
  const hasUnsavedProgram =
    editorState.hasUnsavedCore || iconKey !== savedIconKey;
  const canSaveProgram = hasUnsavedProgram || editorState.hasUnsavedChanges;
  const [selectedTemplateName, setSelectedTemplateName] = useState(() => {
    const currentTemplate = templates.find(
      (template) => template._id === initialProgram.formTemplateId,
    );

    return currentTemplate?.name ?? null;
  });
  const [isUseTemplateDialogOpen, setIsUseTemplateDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleUseTemplate = async (template: Doc<"formTemplates">) => {
    const nextDefinition = buildProgramFormDefinitionFromTemplate(
      template,
      formCopy,
    );

    setIsSaving(true);

    try {
      const [templateDocuments, templatePayments] = await Promise.all([
        convex.query(api.templateDocuments.getByTemplate, {
          templateId: template._id,
        }),
        convex.query(api.templatePayments.getByTemplate, {
          templateId: template._id,
        }),
      ]);

      setFormDefinition(nextDefinition);
      setDocumentConfigs(
        mapEditableDocumentConfigs(
          [...templateDocuments].sort(
            (left, right) => left._creationTime - right._creationTime,
          ),
        ),
      );
      setPaymentConfigs(mapEditablePaymentDefaults(templatePayments));
      setSelectedTemplateName(template.name);
      setActiveTab("application");
      setIsUseTemplateDialogOpen(false);
      toast.success(t("feedback.templateApplied"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("feedback.saveError");
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProgram = async (values: {
    saveProgram: boolean;
    saveTemplate: boolean;
    templateName: string;
  }) => {
    const fieldNameErrors = getProgramFormFieldNameErrors(formDefinition);
    if (Object.keys(fieldNameErrors).length > 0) {
      toast.error(t("feedback.invalidFormDefinition"));
      return;
    }

    const shouldSaveProgram = values.saveProgram && canSaveProgram;
    const shouldSaveTemplate = values.saveTemplate;

    if (!shouldSaveProgram && !shouldSaveTemplate) {
      setIsSaveDialogOpen(false);
      return;
    }

    setIsSaving(true);

    try {
      const result = await saveProgram({
        programId: initialProgram._id,
        name,
        description: description || undefined,
        iconKey,
        formDefinition: serializedFormDefinition,
        saveProgram: shouldSaveProgram,
        saveTemplate: shouldSaveTemplate,
        templateName: shouldSaveTemplate ? values.templateName : undefined,
        templateDescription: shouldSaveTemplate
          ? description || undefined
          : undefined,
        documentConfigs: documentConfigs === null ? undefined : documentConfigs,
        paymentConfigs:
          savablePaymentConfigs === null ? undefined : savablePaymentConfigs,
        templateSections: shouldSaveTemplate
          ? buildTemplateSectionsFromProgramForm(formDefinition, (index) =>
              tBuilder("preview.stepLabel", { current: index + 1 }),
            )
          : undefined,
      });

      if (result.savedProgram) {
        setSavedIconKey(iconKey);
        editorState.markCurrentStateAsSaved();
      }

      setIsSaveDialogOpen(false);

      if (result.savedProgram && result.templateId) {
        toast.success(t("feedback.saveBothSuccess"));
      } else if (result.templateId) {
        toast.success(t("feedback.saveTemplateSuccess"));
      } else {
        toast.success(t("feedback.saveSuccess"));
      }
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
        media={
          <ProgramIconPicker
            iconKey={iconKey}
            disabled={isSaving}
            onChange={setIconKey}
          />
        }
        title={
          <InlineHeaderEditField
            value={name}
            fallback={t("header.nameFallback")}
            ariaLabel={t("header.editName")}
            disabled={isSaving}
            inputClassName="h-8 w-[260px] max-w-full"
            onChange={setName}
          />
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
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setIsUseTemplateDialogOpen(true)}
              disabled={isSaving || templates.length === 0}
            >
              {selectedTemplateName ?? t("header.useTemplateAction")}
            </Button>
            <Button
              onClick={() => setIsSaveDialogOpen(true)}
              disabled={isSaving}
            >
              {t("header.saveAction")}
            </Button>
          </div>
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
          <ProgramDocuments
            documents={documentConfigs}
            onChange={setDocumentConfigs}
          />
        }
        paymentsContent={
          <ProgramPayments fees={paymentConfigs} onChange={setPaymentConfigs} />
        }
      />

      <ProgramSaveDialog
        open={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        programName={name}
        canSaveProgram={canSaveProgram}
        isSaving={isSaving}
        onConfirm={handleSaveProgram}
      />

      <ProgramUseTemplateDialog
        open={isUseTemplateDialogOpen}
        onOpenChange={setIsUseTemplateDialogOpen}
        templates={templates}
        onSelect={handleUseTemplate}
      />
    </>
  );
}
