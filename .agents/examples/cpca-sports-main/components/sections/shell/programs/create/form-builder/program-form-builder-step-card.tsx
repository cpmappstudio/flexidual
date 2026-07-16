"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ProgramFormBuilderItem } from "./program-form-builder-item";
import {
  getProgramFormStepTitle,
  PROGRAM_FORM_STEP_ICON_OPTIONS,
  ProgramFormStepMarker,
} from "./program-form-step-icons";
import type {
  ProgramFormElement,
  ProgramFormStep,
  ProgramFormStepIcon,
} from "./types";

interface ProgramFormBuilderStepCardProps {
  step: ProgramFormStep;
  stepIndex: number;
  canRemove: boolean;
  selectedElementId: string | null;
  onAddElement: () => void;
  onAddStep: () => void;
  onRemoveStep: () => void;
  onUpdateStep: (
    patch: Partial<Pick<ProgramFormStep, "title" | "icon">>,
  ) => void;
  onSelectElement: (elementId: string) => void;
  onDeleteElement: (elementId: string) => void;
  onReorderElements: (elements: ProgramFormElement[]) => void;
}

export function ProgramFormBuilderStepCard({
  step,
  stepIndex,
  canRemove,
  selectedElementId,
  onAddElement,
  onAddStep,
  onRemoveStep,
  onUpdateStep,
  onSelectElement,
  onDeleteElement,
  onReorderElements,
}: ProgramFormBuilderStepCardProps) {
  const t = useTranslations("Programs.create.builder");
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={step}
      id={step.id}
      layout
      dragControls={dragControls}
      dragListener={false}
    >
      <div className="rounded-sm border border-dashed bg-background px-2 py-4 sm:px-3 md:px-4 md:py-5">
        <div className="flex items-center justify-between pb-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-md text-xs"
            onClick={onAddElement}
          >
            <Plus className="size-3.5" />
            {t("editor.actions.addElement")}
          </Button>
          <div
            className="grid size-6 cursor-grab place-items-center text-muted-foreground active:cursor-grabbing"
            onPointerDown={(event) => {
              event.stopPropagation();
              dragControls.start(event);
            }}
          >
            <GripVertical className="size-4" />
          </div>
        </div>

        {step.elements.length > 0 ? (
          <Reorder.Group
            axis="y"
            values={step.elements}
            onReorder={onReorderElements}
            className="flex flex-col gap-3"
          >
            {step.elements.map((element) => (
              <ProgramFormBuilderItem
                key={element.id}
                element={element}
                isSelected={element.id === selectedElementId}
                onEdit={() => onSelectElement(element.id)}
                onDelete={() => onDeleteElement(element.id)}
              />
            ))}
          </Reorder.Group>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
            {t("editor.emptyDescription")}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 px-0 pt-4 sm:px-2">
          <div className="flex min-w-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="rounded-sm"
                  aria-label={t("editor.step.iconLabel")}
                >
                  <ProgramFormStepMarker
                    icon={step.icon}
                    stepNumber={stepIndex + 1}
                    className="size-3.5"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {t("editor.step.iconLabel")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={step.icon}
                  onValueChange={(value) =>
                    onUpdateStep({ icon: value as ProgramFormStepIcon })
                  }
                >
                  {PROGRAM_FORM_STEP_ICON_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      className="gap-1.5 rounded-sm py-1 pl-2 text-xs data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [&>span]:hidden"
                    >
                      <ProgramFormStepMarker
                        icon={option.value}
                        stepNumber={stepIndex + 1}
                        className="size-3.5"
                      />
                      {t(`editor.stepIcons.${option.value}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Input
              value={step.title}
              onChange={(event) => onUpdateStep({ title: event.target.value })}
              placeholder={getProgramFormStepTitle(
                step,
                stepIndex,
                t("defaults.stepLabel", { current: stepIndex + 1 }),
              )}
              className="h-8 min-w-0 max-w-56 rounded-sm border-0 bg-transparent px-2 text-sm font-medium shadow-none focus-visible:border focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            {canRemove ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md text-xs"
                onClick={onRemoveStep}
              >
                <Trash2 className="size-3.5" />
                {t("editor.actions.removeStep")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="rounded-md text-xs"
              onClick={onAddStep}
            >
              <Plus className="size-3.5" />
              {t("editor.actions.addStep")}
            </Button>
          </div>
        </div>
      </div>
    </Reorder.Item>
  );
}
