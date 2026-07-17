"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import type {
  Application,
  ApplicationApplicant,
  FormData as ApplicationFormData,
} from "@/lib/applications/types";
import { getFormField } from "@/lib/applications/types";
import { createProgramFormCopy } from "@/components/sections/shell/programs/create/form-builder/program-form-copy";
import {
  parseProgramFormDefinition,
  type ProgramFormCopy,
} from "@/components/sections/shell/programs/create/form-builder/utils";
import {
  buildInitialProgramFormValues,
  buildProgramFormData,
  isProgramFieldValueMissing,
} from "@/components/sections/shell/programs/create/form-builder/program-form-runtime";
import {
  RenderProgramFormElement,
  getPreviewWidthClass,
} from "@/components/sections/shell/programs/create/form-builder/render-program-form-element";
import { getProgramFormStepTitle } from "@/components/sections/shell/programs/create/form-builder/program-form-step-icons";
import type {
  ProgramFormDefinition,
  ProgramFormErrors,
  ProgramFormValues,
} from "@/components/sections/shell/programs/create/form-builder/types";

interface ApplicationDynamicFormProps {
  application: Application;
  formData: ApplicationFormData;
  applicant?: ApplicationApplicant;
  isEditing: boolean;
  onApplicantChange: (applicant: ApplicationApplicant) => void;
  onFormDataChange: (formData: ApplicationFormData) => void;
  onValidationChange: (isValid: boolean) => void;
}

function getApplicantFallback(
  formData: ApplicationFormData,
  applicant?: ApplicationApplicant,
): ApplicationApplicant {
  return {
    photoStorageId: applicant?.photoStorageId,
    firstName:
      applicant?.firstName ?? getFormField(formData, "athlete", "firstName"),
    lastName:
      applicant?.lastName ?? getFormField(formData, "athlete", "lastName"),
    email: applicant?.email ?? getFormField(formData, "athlete", "email"),
    telephone:
      applicant?.telephone ?? getFormField(formData, "athlete", "telephone"),
  };
}

function validateApplicant(
  applicant: ApplicationApplicant,
  tValidation: ReturnType<typeof useTranslations<"Common.validation">>,
) {
  const errors: Record<string, string> = {};

  if (!applicant.firstName.trim()) {
    errors.firstName = tValidation("required");
  }
  if (!applicant.lastName.trim()) {
    errors.lastName = tValidation("required");
  }
  if (!applicant.email.trim()) {
    errors.email = tValidation("required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant.email)) {
    errors.email = tValidation("email");
  }
  if (!applicant.telephone.trim()) {
    errors.telephone = tValidation("required");
  }

  return errors;
}

function validateDynamicFields(
  definition: ProgramFormDefinition | null,
  values: ProgramFormValues,
  requiredMessage: string,
) {
  const errors: ProgramFormErrors = {};

  if (!definition) {
    return errors;
  }

  for (const step of definition.steps) {
    for (const element of step.elements) {
      if (isProgramFieldValueMissing(element, values[element.name])) {
        errors[element.name] = requiredMessage;
      }
    }
  }

  return errors;
}

function getDisplayElementState(
  definition: ProgramFormDefinition | null,
  formData: ApplicationFormData,
) {
  if (!definition) {
    return {};
  }

  return buildInitialProgramFormValues(definition, formData);
}

export function ApplicationDynamicForm({
  application,
  formData,
  applicant,
  isEditing,
  onApplicantChange,
  onFormDataChange,
  onValidationChange,
}: ApplicationDynamicFormProps) {
  const t = useTranslations("Applications");
  const tDetail = useTranslations("Applications.detail");
  const tValidation = useTranslations("Common.validation");
  const tBuilder = useTranslations("Programs.create.builder");

  const formCopy = useMemo<ProgramFormCopy>(
    () => createProgramFormCopy(tBuilder),
    [tBuilder],
  );
  const definition = useMemo(
    () =>
      application.formDefinitionSnapshot
        ? parseProgramFormDefinition(
            application.formDefinitionSnapshot,
            formCopy,
          )
        : null,
    [application.formDefinitionSnapshot, formCopy],
  );
  const [values, setValues] = useState<ProgramFormValues>(() =>
    getDisplayElementState(definition, formData),
  );
  const [localApplicant, setLocalApplicant] = useState<ApplicationApplicant>(
    () => getApplicantFallback(formData, applicant),
  );
  const [applicantErrors, setApplicantErrors] = useState<
    Record<string, string>
  >({});
  const [fieldErrors, setFieldErrors] = useState<ProgramFormErrors>({});

  useEffect(() => {
    setValues(getDisplayElementState(definition, formData));
    setLocalApplicant(getApplicantFallback(formData, applicant));
    setApplicantErrors({});
    setFieldErrors({});
  }, [applicant, definition, formData]);

  useEffect(() => {
    if (!isEditing) {
      onValidationChange(true);
      return;
    }

    const nextApplicantErrors = validateApplicant(localApplicant, tValidation);
    const nextFieldErrors = validateDynamicFields(
      definition,
      values,
      tValidation("required"),
    );

    setApplicantErrors(nextApplicantErrors);
    setFieldErrors(nextFieldErrors);
    onValidationChange(
      Object.keys(nextApplicantErrors).length === 0 &&
        Object.keys(nextFieldErrors).length === 0,
    );
  }, [
    definition,
    isEditing,
    localApplicant,
    onValidationChange,
    tValidation,
    values,
  ]);

  const handleApplicantFieldChange = (
    field: keyof Omit<ApplicationApplicant, "photoStorageId">,
    value: string,
  ) => {
    const nextApplicant = {
      ...localApplicant,
      [field]: value,
    };

    setLocalApplicant(nextApplicant);
    onApplicantChange(nextApplicant);
  };

  const handleValueChange = (name: string, value: unknown) => {
    const nextValues = {
      ...values,
      [name]: value,
    };

    setValues(nextValues);
    if (definition) {
      onFormDataChange(buildProgramFormData(definition, nextValues));
    }
  };

  const openItems = isEditing
    ? ["core", ...(definition?.steps.map((step) => step.id) ?? [])]
    : undefined;

  return (
    <Accordion type="multiple" value={openItems} className="w-full">
      <AccordionItem value="core">
        <AccordionTrigger>{tDetail("applicantInfo")}</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{tDetail("firstName")}</FieldLabel>
                <Input
                  value={localApplicant.firstName}
                  onChange={(event) =>
                    handleApplicantFieldChange("firstName", event.target.value)
                  }
                  disabled={!isEditing}
                />
                {isEditing ? (
                  <FieldError
                    errors={
                      applicantErrors.firstName
                        ? [{ message: applicantErrors.firstName }]
                        : undefined
                    }
                  />
                ) : null}
              </Field>
              <Field>
                <FieldLabel>{tDetail("lastName")}</FieldLabel>
                <Input
                  value={localApplicant.lastName}
                  onChange={(event) =>
                    handleApplicantFieldChange("lastName", event.target.value)
                  }
                  disabled={!isEditing}
                />
                {isEditing ? (
                  <FieldError
                    errors={
                      applicantErrors.lastName
                        ? [{ message: applicantErrors.lastName }]
                        : undefined
                    }
                  />
                ) : null}
              </Field>
              <Field>
                <FieldLabel>{tDetail("email")}</FieldLabel>
                <Input
                  type="email"
                  value={localApplicant.email}
                  onChange={(event) =>
                    handleApplicantFieldChange("email", event.target.value)
                  }
                  disabled={!isEditing}
                />
                {isEditing ? (
                  <FieldError
                    errors={
                      applicantErrors.email
                        ? [{ message: applicantErrors.email }]
                        : undefined
                    }
                  />
                ) : null}
              </Field>
              <Field>
                <FieldLabel>{tDetail("phone")}</FieldLabel>
                <Input
                  type="tel"
                  value={localApplicant.telephone}
                  onChange={(event) =>
                    handleApplicantFieldChange("telephone", event.target.value)
                  }
                  disabled={!isEditing}
                />
                {isEditing ? (
                  <FieldError
                    errors={
                      applicantErrors.telephone
                        ? [{ message: applicantErrors.telephone }]
                        : undefined
                    }
                  />
                ) : null}
              </Field>
            </div>
          </FieldGroup>
        </AccordionContent>
      </AccordionItem>

      {definition?.steps.length ? (
        definition.steps.map((step, index) => (
          <AccordionItem key={step.id} value={step.id}>
            <AccordionTrigger>
              {getProgramFormStepTitle(step, index, `Step ${index + 1}`)}
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 text-balance">
              {step.elements.length ? (
                <div className="grid grid-cols-6 gap-4">
                  {step.elements.map((element) => {
                    const renderedElement =
                      !isEditing &&
                      element.fieldType !== "Text" &&
                      element.fieldType !== "Separator"
                        ? { ...element, disabled: true }
                        : element;

                    return (
                      <div
                        key={element.id}
                        className={getPreviewWidthClass(element)}
                      >
                        <RenderProgramFormElement
                          element={renderedElement}
                          values={values}
                          errors={isEditing ? fieldErrors : {}}
                          onChange={handleValueChange}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {tDetail("noAdditionalFields")}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        ))
      ) : (
        <AccordionItem value="program">
          <AccordionTrigger>{t("program")}</AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground">
            {tDetail("noAdditionalFields")}
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}
