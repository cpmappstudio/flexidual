"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  RenderProgramFormElement,
  getPreviewWidthClass,
} from "./render-program-form-element";
import { ProgramFormStepNavigation } from "./program-form-step-navigation";
import { getProgramFormStepTitle } from "./program-form-step-icons";
import { isStaticElement } from "./utils";
import type {
  ProgramFormDefinition,
  ProgramFormElement,
  ProgramFormErrors,
  ProgramFormValues,
} from "./types";

interface ProgramFormPreviewProps {
  definition: ProgramFormDefinition;
}

function isFieldValueMissing(element: ProgramFormElement, value: unknown) {
  if (isStaticElement(element)) {
    return false;
  }

  if (!element.required) {
    return false;
  }

  if (element.fieldType === "Checkbox" || element.fieldType === "Switch") {
    return value !== true;
  }

  if (element.fieldType === "DatePicker") {
    if (element.mode === "range") {
      const range = value as DateRange | undefined;
      return !(range?.from && range.to);
    }

    return !(value instanceof Date);
  }

  if (typeof value === "number") {
    return Number.isNaN(value);
  }

  return String(value ?? "").trim() === "";
}

function validateElements(
  elements: ProgramFormElement[],
  values: ProgramFormValues,
  requiredMessage: string,
) {
  const nextErrors: ProgramFormErrors = {};

  for (const element of elements) {
    if (isFieldValueMissing(element, values[element.name])) {
      nextErrors[element.name] = requiredMessage;
    }
  }

  return nextErrors;
}

export function ProgramFormPreview({ definition }: ProgramFormPreviewProps) {
  const t = useTranslations("Programs.create.builder.preview");
  const [values, setValues] = useState<ProgramFormValues>({});
  const [errors, setErrors] = useState<ProgramFormErrors>({});
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const steps = definition.steps;
  const isMultiStep = steps.length > 1;
  const currentStep = steps[activeStepIndex] ?? steps[0];
  const isLastStep = activeStepIndex === steps.length - 1;

  useEffect(() => {
    if (activeStepIndex > steps.length - 1) {
      setActiveStepIndex(0);
    }
  }, [activeStepIndex, steps.length]);

  useEffect(() => {
    setErrors({});
    setIsSubmitted(false);
  }, [definition]);

  const handleChange = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[name];
      return nextErrors;
    });
  };

  const resetPreview = () => {
    setValues({});
    setErrors({});
    setActiveStepIndex(0);
    setIsSubmitted(false);
  };

  const handleSubmit = () => {
    const nextErrors = validateElements(
      currentStep?.elements ?? [],
      values,
      t("requiredError"),
    );

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (isMultiStep && !isLastStep) {
      setActiveStepIndex((current) => Math.min(current + 1, steps.length - 1));
      return;
    }

    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="rounded-2xl border-[3px] bg-background px-4 py-16 md:px-6">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <div className="space-y-2">
            <h3 className="font-semibold">{t("successTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("successDescription")}
            </p>
          </div>
          <Button variant="outline" onClick={resetPreview}>
            {t("backToForm")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0 px-2 sm:px-0">
      {isMultiStep ? (
        <ProgramFormStepNavigation
          steps={steps}
          currentStepIndex={activeStepIndex}
          onStepClick={(stepIndex) => setActiveStepIndex(stepIndex)}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">
            {currentStep
              ? getProgramFormStepTitle(
                  currentStep,
                  activeStepIndex,
                  t("stepLabel", { current: activeStepIndex + 1 }),
                )
              : t("titleFallback")}
          </CardTitle>
          <CardDescription>
            {isMultiStep
              ? t("stepCounter", {
                  current: activeStepIndex + 1,
                  total: steps.length,
                })
              : t("singleStepDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6 sm:space-y-8">
            <div className="grid min-h-28 grid-cols-6 gap-4">
              {(currentStep?.elements ?? []).map((element) => (
                <div key={element.id} className={getPreviewWidthClass(element)}>
                  <RenderProgramFormElement
                    element={element}
                    values={values}
                    errors={errors}
                    onChange={handleChange}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col justify-between gap-3 pt-6 sm:flex-row sm:gap-0">
              <Button
                variant="outline"
                onClick={() =>
                  setActiveStepIndex((current) => Math.max(current - 1, 0))
                }
                disabled={activeStepIndex === 0}
                className="w-full sm:w-auto"
              >
                <ChevronLeft className="size-4" />
                {t("previous")}
              </Button>
              <Button onClick={handleSubmit} className="w-full sm:w-auto">
                {isMultiStep && !isLastStep ? (
                  <>
                    {t("next")}
                    <ChevronRight className="size-4" />
                  </>
                ) : (
                  t("submit")
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
