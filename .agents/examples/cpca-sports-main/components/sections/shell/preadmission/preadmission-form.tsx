"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RenderProgramFormElement,
  getPreviewWidthClass,
} from "@/components/sections/shell/programs/create/form-builder/render-program-form-element";
import { getProgramFormStepTitle } from "@/components/sections/shell/programs/create/form-builder/program-form-step-icons";
import { SuccessMessage } from "./success-message";
import { PreadmissionCoreStep } from "./preadmission-core-step";
import {
  PreadmissionStepsNavigation,
  type PreadmissionStepItem,
} from "./preadmission-steps-navigation";
import { usePreadmissionForm } from "./use-preadmission-form";
import type { AvailableProgramForApplication } from "./preadmission-types";

interface PreAdmissionFormProps {
  organizationSlug: string;
  programs: AvailableProgramForApplication[];
}

export function PreAdmissionForm({
  organizationSlug,
  programs,
}: PreAdmissionFormProps) {
  const t = useTranslations("preadmission");
  const form = usePreadmissionForm({ organizationSlug, programs });

  if (form.isSubmitted) {
    return (
      <SuccessMessage
        applicationCode={form.applicationCode}
        onNewApplication={form.handleNewApplication}
      />
    );
  }

  const steps: PreadmissionStepItem[] = [
    {
      id: "core",
      title: t("core.stepLabel"),
      icon: "athlete",
    },
    ...form.dynamicSteps.map((step, index) => ({
      id: step.id,
      title: getProgramFormStepTitle(
        step,
        index,
        t("steps.programStepFallback", { current: index + 1 }),
      ),
      icon: step.icon,
    })),
  ];

  const title = form.isCoreStep
    ? t("core.title")
    : form.currentProgramStep
      ? getProgramFormStepTitle(
          form.currentProgramStep,
          form.currentStepIndex - 1,
          t("steps.programStepFallback", { current: form.currentStepIndex }),
        )
      : t("core.title");

  const description = form.isCoreStep
    ? t("core.cardDescription")
    : form.selectedProgram?.name ?? t("core.programDescription");

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto">
        <PreadmissionStepsNavigation
          steps={steps}
          currentStepIndex={form.currentStepIndex}
          completedSteps={form.completedSteps}
          onStepClick={form.handleStepClick}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit();
              }}
              className="space-y-6 sm:space-y-8"
            >
              {form.isCoreStep ? (
                <PreadmissionCoreStep
                  programs={programs}
                  selectedProgramId={form.selectedProgramId}
                  applicant={form.applicant}
                  errors={form.errors}
                  onSelectProgram={form.handleSelectProgram}
                  onApplicantChange={form.handleApplicantChange}
                />
              ) : form.currentProgramStep ? (
                <div className="grid grid-cols-6 gap-4">
                  {form.currentProgramStep.elements.map((element) => (
                    <div
                      key={element.id}
                      className={getPreviewWidthClass(element)}
                    >
                      <RenderProgramFormElement
                        element={element}
                        values={form.programValues}
                        errors={form.errors}
                        onChange={form.handleProgramValueChange}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {form.submitError ? (
                <Alert variant="destructive">
                  <AlertDescription>{form.submitError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={form.handleBack}
                  disabled={form.currentStepIndex === 0 || form.isSubmitting}
                  className="w-full sm:w-auto"
                >
                  {t("navigation.back")}
                </Button>
                <Button
                  type="submit"
                  disabled={form.isSubmitting}
                  className="w-full sm:w-auto"
                >
                  {form.isSubmitting
                    ? t("navigation.submitting")
                    : form.isLastStep
                      ? t("navigation.submit")
                      : t("navigation.next")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
