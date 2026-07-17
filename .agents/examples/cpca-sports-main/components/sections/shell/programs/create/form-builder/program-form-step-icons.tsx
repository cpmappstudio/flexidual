import type { ComponentType, SVGProps } from "react";
import {
  AcademicCapIcon,
  DocumentTextIcon,
  MapPinIcon,
  UserIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import type { ProgramFormStep, ProgramFormStepIcon } from "./types";

type StepIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const PROGRAM_FORM_STEP_ICON_OPTIONS: Array<{
  value: ProgramFormStepIcon;
  icon?: StepIconComponent;
}> = [
  { value: "number" },
  { value: "athlete", icon: UserIcon },
  { value: "address", icon: MapPinIcon },
  { value: "school", icon: AcademicCapIcon },
  { value: "parents", icon: UsersIcon },
  { value: "general", icon: DocumentTextIcon },
];

const STEP_ICONS: Partial<Record<ProgramFormStepIcon, StepIconComponent>> = {
  athlete: UserIcon,
  address: MapPinIcon,
  school: AcademicCapIcon,
  parents: UsersIcon,
  general: DocumentTextIcon,
};

export function getProgramFormStepTitle(
  step: Pick<ProgramFormStep, "title">,
  stepIndex: number,
  fallbackTitle?: string,
) {
  return step.title.trim() || fallbackTitle || `Step ${stepIndex + 1}`;
}

interface ProgramFormStepMarkerProps {
  icon: ProgramFormStepIcon;
  stepNumber: number;
  className?: string;
}

export function ProgramFormStepMarker({
  icon,
  stepNumber,
  className,
}: ProgramFormStepMarkerProps) {
  if (icon === "number") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-xs font-semibold",
          className,
        )}
      >
        {stepNumber}
      </span>
    );
  }

  const Icon = STEP_ICONS[icon];
  if (!Icon) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-xs font-semibold",
          className,
        )}
      >
        {stepNumber}
      </span>
    );
  }

  return <Icon className={className} />;
}
