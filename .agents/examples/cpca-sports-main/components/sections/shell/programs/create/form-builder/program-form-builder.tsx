"use client";

import { useEffect, useMemo, useState } from "react";
import { Reorder } from "motion/react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ProgramFormPreview } from "./program-form-preview";
import { AddElementDialog } from "./program-form-builder-dialogs";
import { ProgramFormElementSettings } from "./program-form-builder-settings";
import { ProgramFormBuilderStepCard } from "./program-form-builder-step-card";
import { createProgramFormCopy } from "./program-form-copy";
import {
  cloneDefinition,
  createDefaultElement,
  createEmptyStep,
  getProgramFormFieldNameErrors,
} from "./utils";
import type {
  ProgramFormDefinition,
  ProgramFormElement,
  ProgramFormElementType,
  ProgramFormStep,
} from "./types";

interface ProgramFormBuilderProps {
  value: ProgramFormDefinition;
  onChange: (value: ProgramFormDefinition) => void;
}

export function ProgramFormBuilder({
  value,
  onChange,
}: ProgramFormBuilderProps) {
  const t = useTranslations("Programs.create.builder");
  const formCopy = useMemo(() => createProgramFormCopy(t), [t]);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    value.steps[0]?.id ?? null,
  );
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );

  const selectedElementRecord = useMemo(() => {
    for (const step of value.steps) {
      const element = step.elements.find(
        (current) => current.id === selectedElementId,
      );
      if (element) {
        return { stepId: step.id, element };
      }
    }

    return null;
  }, [selectedElementId, value.steps]);
  const selectedElement = selectedElementRecord?.element ?? null;
  const fieldNameErrors = useMemo(
    () => getProgramFormFieldNameErrors(value),
    [value],
  );

  useEffect(() => {
    if (!value.steps.length) {
      return;
    }

    if (
      !selectedStepId ||
      !value.steps.some((step) => step.id === selectedStepId)
    ) {
      setSelectedStepId(value.steps[0].id);
    }
  }, [selectedStepId, value.steps]);

  useEffect(() => {
    if (
      selectedElementId &&
      !value.steps.some((step) =>
        step.elements.some((element) => element.id === selectedElementId),
      )
    ) {
      setSelectedElementId(null);
    }
  }, [selectedElementId, value.steps]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "f") {
        return;
      }

      event.preventDefault();
      setIsCommandOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const updateDefinition = (
    updater: (current: ProgramFormDefinition) => ProgramFormDefinition,
  ) => {
    onChange(updater(cloneDefinition(value)));
  };

  const updateSteps = (
    updater: (
      steps: ProgramFormDefinition["steps"],
    ) => ProgramFormDefinition["steps"],
  ) => {
    updateDefinition((current) => {
      const steps = updater(current.steps);
      return {
        ...current,
        steps,
        isMultiStep: steps.length > 1,
      };
    });
  };

  const updateStepElements = (
    stepId: string,
    updater: (elements: ProgramFormElement[]) => ProgramFormElement[],
  ) => {
    updateSteps((steps) =>
      steps.map((step) =>
        step.id === stepId
          ? { ...step, elements: updater(step.elements) }
          : step,
      ),
    );
  };

  const updateStep = (
    stepId: string,
    updater: (step: ProgramFormStep) => ProgramFormStep,
  ) => {
    updateSteps((steps) =>
      steps.map((step) => (step.id === stepId ? updater(step) : step)),
    );
  };

  const updateSelectedElement = (
    updater: (element: ProgramFormElement) => ProgramFormElement,
  ) => {
    if (!selectedElementRecord) {
      return;
    }

    updateStepElements(selectedElementRecord.stepId, (elements) =>
      elements.map((element) =>
        element.id === selectedElementRecord.element.id
          ? updater(element)
          : element,
      ),
    );
  };

  const handleOpenAddElement = (stepId: string) => {
    setSelectedStepId(stepId);
    setIsCommandOpen(true);
  };

  const handleAddElement = (fieldType: ProgramFormElementType) => {
    if (!selectedStepId) {
      return;
    }

    const nextElement = createDefaultElement(fieldType, formCopy);
    updateStepElements(selectedStepId, (elements) => [
      ...elements,
      nextElement,
    ]);
    setSelectedElementId(nextElement.id);
    setIsCommandOpen(false);
  };

  const handleDeleteElement = (stepId: string, elementId: string) => {
    updateStepElements(stepId, (elements) =>
      elements.filter((element) => element.id !== elementId),
    );

    if (selectedElementId === elementId) {
      setSelectedElementId(null);
    }
  };

  const handleAddStep = (stepId: string) => {
    const nextStep = createEmptyStep(value.steps.length, formCopy);
    updateSteps((steps) => {
      const stepIndex = steps.findIndex((step) => step.id === stepId);
      if (stepIndex < 0) {
        return [...steps, nextStep];
      }

      return [
        ...steps.slice(0, stepIndex + 1),
        nextStep,
        ...steps.slice(stepIndex + 1),
      ];
    });
    setSelectedStepId(nextStep.id);
    setSelectedElementId(null);
  };

  const handleRemoveStep = (stepId: string) => {
    if (value.steps.length <= 1) {
      return;
    }

    const nextSteps = value.steps.filter((step) => step.id !== stepId);
    updateSteps(() => nextSteps);
    if (selectedStepId === stepId) {
      setSelectedStepId(nextSteps[0]?.id ?? null);
    }
    if (selectedElementRecord?.stepId === stepId) {
      setSelectedElementId(null);
    }
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Reorder.Group<ProgramFormDefinition["steps"]>
            axis="y"
            values={value.steps}
            onReorder={(steps) => updateSteps(() => steps)}
            className="flex flex-col gap-4"
          >
            {value.steps.map((step, index) => (
              <ProgramFormBuilderStepCard
                key={step.id}
                step={step}
                stepIndex={index}
                canRemove={value.steps.length > 1}
                selectedElementId={selectedElementId}
                onAddElement={() => handleOpenAddElement(step.id)}
                onAddStep={() => handleAddStep(step.id)}
                onRemoveStep={() => handleRemoveStep(step.id)}
                onUpdateStep={(patch) =>
                  updateStep(step.id, (current) => ({
                    ...current,
                    ...patch,
                  }))
                }
                onSelectElement={setSelectedElementId}
                onDeleteElement={(elementId) =>
                  handleDeleteElement(step.id, elementId)
                }
                onReorderElements={(elements) =>
                  updateStepElements(step.id, () => elements)
                }
              />
            ))}
          </Reorder.Group>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <div className="lg:sticky lg:top-4">
            <ProgramFormPreview definition={value} />
          </div>
        </div>
      </div>

      <AddElementDialog
        open={isCommandOpen}
        onOpenChange={setIsCommandOpen}
        onSelect={handleAddElement}
      />

      <Sheet
        open={selectedElement !== null}
        onOpenChange={(open) => !open && setSelectedElementId(null)}
      >
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{t("settings.title")}</SheetTitle>
            <SheetDescription>{t("settings.description")}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {selectedElement ? (
              <ProgramFormElementSettings
                element={selectedElement}
                nameError={fieldNameErrors[selectedElement.id]}
                onChange={updateSelectedElement}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
