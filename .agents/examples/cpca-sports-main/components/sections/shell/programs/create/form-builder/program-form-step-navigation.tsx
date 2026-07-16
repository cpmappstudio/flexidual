"use client";

import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  getProgramFormStepTitle,
  ProgramFormStepMarker,
} from "./program-form-step-icons";
import type { ProgramFormStep } from "./types";

interface ProgramFormStepNavigationProps {
  steps: ProgramFormStep[];
  currentStepIndex: number;
  onStepClick: (stepIndex: number) => void;
}

export function ProgramFormStepNavigation({
  steps,
  currentStepIndex,
  onStepClick,
}: ProgramFormStepNavigationProps) {
  const t = useTranslations("Programs.create.builder.preview");

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex min-w-max items-center justify-between gap-1 sm:min-w-0 sm:gap-2">
        {steps.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isCompleted = index < currentStepIndex;
          const isAccessible = index <= currentStepIndex;

          return (
            <div key={step.id} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => onStepClick(index)}
                disabled={!isAccessible}
                className={cn(
                  "flex w-full flex-col items-center gap-1.5 rounded-lg p-2 transition-colors sm:gap-2 sm:p-3",
                  isActive && "bg-primary/10",
                  !isActive && isAccessible && "hover:bg-muted",
                  !isAccessible && "cursor-not-allowed opacity-50",
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
                    isCompleted && !isActive && "bg-green-500 text-white",
                    isActive && "bg-primary text-primary-foreground",
                    !isCompleted &&
                      !isActive &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {isCompleted && !isActive ? (
                    <CheckCircleIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                  ) : (
                    <ProgramFormStepMarker
                      icon={step.icon}
                      stepNumber={index + 1}
                      className="h-5 w-5 sm:h-6 sm:w-6"
                    />
                  )}
                </div>
                <div className="text-center">
                  <p
                    className={cn(
                      "text-xs font-medium whitespace-nowrap sm:text-sm",
                      isActive && "text-primary",
                    )}
                  >
                    {getProgramFormStepTitle(
                      step,
                      index,
                      t("stepLabel", { current: index + 1 }),
                    )}
                  </p>
                  <p className="text-muted-foreground hidden text-[10px] sm:block sm:text-xs">
                    {t("stepLabel", { current: index + 1 })}
                  </p>
                </div>
              </button>

              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    "mx-1 h-0.5 flex-1 transition-colors sm:mx-2",
                    isCompleted ? "bg-green-500" : "bg-muted",
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
