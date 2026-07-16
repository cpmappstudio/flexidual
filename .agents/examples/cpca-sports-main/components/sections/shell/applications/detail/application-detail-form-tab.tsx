"use client";

import { Check, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type {
  Application,
  ApplicationApplicant,
  FormData as ApplicationFormData,
} from "@/lib/applications/types";
import { ApplicationDynamicForm } from "./application-dynamic-form";
import { ApplicationLegacyForm } from "./application-legacy-form";

interface ApplicationDetailFormTabProps {
  application: Application;
  isAdmin: boolean;
  isEditing: boolean;
  isSaving: boolean;
  isFormValid: boolean;
  hasDynamicApplicationForm: boolean;
  formData: ApplicationFormData;
  applicant?: ApplicationApplicant;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onApplicantChange: (applicant: ApplicationApplicant) => void;
  onFormDataChange: (formData: ApplicationFormData) => void;
  onDynamicValidationChange: (isValid: boolean) => void;
  onLegacySectionDataChange: (
    sectionKey: string,
    sectionData: Record<string, string | number | boolean | null>,
  ) => void;
  onLegacySectionValidityChange: (sectionKey: string, isValid: boolean) => void;
}

export function ApplicationDetailFormTab({
  application,
  isAdmin,
  isEditing,
  isSaving,
  isFormValid,
  hasDynamicApplicationForm,
  formData,
  applicant,
  onStartEdit,
  onCancelEdit,
  onSave,
  onApplicantChange,
  onFormDataChange,
  onDynamicValidationChange,
  onLegacySectionDataChange,
  onLegacySectionValidityChange,
}: ApplicationDetailFormTabProps) {
  const tCommon = useTranslations("Common.actions");

  return (
    <>
      {isAdmin ? (
        <div className="mb-4 flex justify-end">
          {isEditing ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onCancelEdit}
                disabled={isSaving}
              >
                <X className="mr-2 h-4 w-4" />
                {tCommon("cancel")}
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={onSave}
                disabled={isSaving || !isFormValid}
              >
                <Check className="mr-2 h-4 w-4" />
                {isSaving ? tCommon("saving") : tCommon("save")}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={onStartEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              {tCommon("edit")}
            </Button>
          )}
        </div>
      ) : null}

      {hasDynamicApplicationForm ? (
        <ApplicationDynamicForm
          application={application}
          formData={formData}
          applicant={applicant}
          isEditing={isEditing}
          onApplicantChange={onApplicantChange}
          onFormDataChange={onFormDataChange}
          onValidationChange={onDynamicValidationChange}
        />
      ) : (
        <ApplicationLegacyForm
          application={application}
          isEditing={isEditing}
          onSectionDataChange={onLegacySectionDataChange}
          onSectionValidityChange={onLegacySectionValidityChange}
        />
      )}
    </>
  );
}
