"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createProgramFormCopy } from "@/components/sections/shell/programs/create/form-builder/program-form-copy";
import { parseProgramFormDefinition } from "@/components/sections/shell/programs/create/form-builder/utils";
import {
  buildProgramFormData,
  isProgramFieldValueMissing,
} from "@/components/sections/shell/programs/create/form-builder/program-form-runtime";
import type {
  ProgramFormErrors,
  ProgramFormValues,
} from "@/components/sections/shell/programs/create/form-builder/types";
import type {
  AvailableProgramForApplication,
  PreadmissionApplicantCore,
} from "./preadmission-types";

interface UsePreadmissionFormOptions {
  organizationSlug: string;
  programs: AvailableProgramForApplication[];
}

function getInitialApplicant(): PreadmissionApplicantCore {
  return {
    photoStorageId: null,
    firstName: "",
    lastName: "",
    email: "",
    telephone: "",
  };
}

export function usePreadmissionForm({
  organizationSlug,
  programs,
}: UsePreadmissionFormOptions) {
  const tValidation = useTranslations("preadmission.validation");
  const tCore = useTranslations("preadmission.core");
  const tBuilder = useTranslations("Programs.create.builder");
  const submitApplication = useMutation(api.applications.submit);

  const formCopy = useMemo(() => createProgramFormCopy(tBuilder), [tBuilder]);
  const [selectedProgramId, setSelectedProgramId] =
    useState<Id<"programs"> | null>(
      programs.length === 1 ? programs[0]._id : null,
    );
  const [applicant, setApplicant] = useState<PreadmissionApplicantCore>(
    getInitialApplicant(),
  );
  const [programValues, setProgramValues] = useState<ProgramFormValues>({});
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [applicationCode, setApplicationCode] = useState("");
  const [errors, setErrors] = useState<ProgramFormErrors>({});

  const selectedProgram = useMemo(
    () => programs.find((program) => program._id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  );
  const definition = useMemo(
    () =>
      selectedProgram
        ? parseProgramFormDefinition(selectedProgram.formDefinition, formCopy)
        : null,
    [formCopy, selectedProgram],
  );
  const dynamicSteps = definition?.steps ?? [];
  const totalSteps = 1 + dynamicSteps.length;
  const currentProgramStep =
    currentStepIndex > 0 ? dynamicSteps[currentStepIndex - 1] : null;
  const isCoreStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  useEffect(() => {
    if (!selectedProgramId && programs.length === 1) {
      setSelectedProgramId(programs[0]._id);
    }
  }, [programs, selectedProgramId]);

  const clearError = (field: string) => {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const handleSelectProgram = (programId: Id<"programs">) => {
    setSelectedProgramId(programId);
    setProgramValues({});
    setErrors({});
    setCompletedSteps(new Set());
    setCurrentStepIndex(0);
    setSubmitError(null);
  };

  const handleApplicantChange = (
    field: keyof PreadmissionApplicantCore,
    value: string | Id<"_storage"> | null,
  ) => {
    setApplicant((current) => ({
      ...current,
      [field]: value,
    }));
    clearError(field);
    if (field === "photoStorageId") {
      clearError("photoStorageId");
    }
  };

  const handleProgramValueChange = (name: string, value: unknown) => {
    setProgramValues((current) => ({ ...current, [name]: value }));
    clearError(name);
  };

  const validateCoreStep = () => {
    const nextErrors: ProgramFormErrors = {};

    if (!selectedProgramId) {
      nextErrors.programId = tValidation("required");
    }
    if (!applicant.photoStorageId) {
      nextErrors.photoStorageId = tValidation("required");
    }
    if (!applicant.firstName.trim()) {
      nextErrors.firstName = tValidation("required");
    }
    if (!applicant.lastName.trim()) {
      nextErrors.lastName = tValidation("required");
    }
    if (!applicant.email.trim()) {
      nextErrors.email = tValidation("required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant.email)) {
      nextErrors.email = tValidation("invalidEmail");
    }
    if (!applicant.telephone.trim()) {
      nextErrors.telephone = tValidation("required");
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateProgramStep = () => {
    if (!currentProgramStep) {
      return true;
    }

    const nextErrors: ProgramFormErrors = {};

    for (const element of currentProgramStep.elements) {
      if (isProgramFieldValueMissing(element, programValues[element.name])) {
        nextErrors[element.name] = tValidation("required");
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex > currentStepIndex && !completedSteps.has(stepIndex - 1)) {
      return;
    }
    setCurrentStepIndex(stepIndex);
  };

  const handleBack = () => {
    setCurrentStepIndex((current) => Math.max(current - 1, 0));
  };

  const advanceStep = () => {
    if (isCoreStep ? !validateCoreStep() : !validateProgramStep()) {
      return;
    }

    setCompletedSteps((current) => {
      const next = new Set(current);
      next.add(currentStepIndex);
      return next;
    });
    setCurrentStepIndex((current) => Math.min(current + 1, totalSteps - 1));
  };

  const handleSubmit = async () => {
    if (!isLastStep) {
      advanceStep();
      return;
    }

    const isValid = isCoreStep ? validateCoreStep() : validateProgramStep();
    if (!isValid || !selectedProgramId) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitApplication({
        organizationSlug,
        programId: selectedProgramId,
        applicant: {
          photoStorageId: applicant.photoStorageId!,
          firstName: applicant.firstName.trim(),
          lastName: applicant.lastName.trim(),
          email: applicant.email.trim(),
          telephone: applicant.telephone.trim(),
        },
        formData: definition
          ? buildProgramFormData(definition, programValues)
          : {},
      });

      setApplicationCode(result.applicationCode);
      setIsSubmitted(true);
      setCompletedSteps(new Set());
    } catch (error) {
      console.error("[Preadmission] Failed to submit application:", error);
      setSubmitError(tCore("submitError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewApplication = () => {
    setSelectedProgramId(
      programs.length === 1 ? (programs[0]?._id ?? null) : null,
    );
    setApplicant(getInitialApplicant());
    setProgramValues({});
    setCurrentStepIndex(0);
    setCompletedSteps(new Set());
    setErrors({});
    setSubmitError(null);
    setApplicationCode("");
    setIsSubmitted(false);
  };

  return {
    applicant,
    applicationCode,
    completedSteps,
    currentProgramStep,
    currentStepIndex,
    definition,
    dynamicSteps,
    errors,
    handleApplicantChange,
    handleBack,
    handleNewApplication,
    handleProgramValueChange,
    handleSelectProgram,
    handleStepClick,
    handleSubmit,
    isCoreStep,
    isLastStep,
    isSubmitted,
    isSubmitting,
    programValues,
    selectedProgram,
    selectedProgramId,
    submitError,
    totalSteps,
  };
}
