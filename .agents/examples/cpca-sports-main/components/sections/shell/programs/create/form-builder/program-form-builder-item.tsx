"use client";

import { CalendarDays, GripVertical, PencilLine, Trash2 } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCatalogItem } from "./catalog";
import { getElementTitle, isStaticElement } from "./utils";
import type { ProgramFormElement } from "./types";

interface ProgramFormBuilderItemProps {
  element: ProgramFormElement;
  isSelected: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProgramFormBuilderItem({
  element,
  isSelected,
  onEdit,
  onDelete,
}: ProgramFormBuilderItemProps) {
  const t = useTranslations("Programs.create.builder");
  const dragControls = useDragControls();
  const item = getCatalogItem(element.fieldType);
  const Icon = item?.icon ?? CalendarDays;
  const summary = isStaticElement(element)
    ? item
      ? t(item.descriptionKey)
      : undefined
    : element.description || (item ? t(item.descriptionKey) : undefined);

  return (
    <Reorder.Item
      value={element}
      id={element.id}
      layout
      dragControls={dragControls}
      dragListener={false}
    >
      <div
        className={`group w-full rounded-xl border bg-accent py-1.5 transition-colors ${
          isSelected ? "border-primary bg-primary/5" : ""
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex min-w-0 items-center justify-start gap-1 size-full">
            <div className="grid size-6 place-items-center">
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <button
              type="button"
              onClick={onEdit}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate max-w-xs md:max-w-sm">
                {getElementTitle(element)}
              </span>
            </button>
          </div>
          <div className="flex items-center justify-end">
            <Badge variant="outline" className="mr-1 hidden sm:inline-flex">
              {item ? t(item.labelKey) : element.fieldType}
            </Badge>
            <div className="flex items-center gap-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onEdit}
              >
                <PencilLine className="size-4" />
                <span className="sr-only">{t("editor.actions.edit")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">{t("editor.actions.delete")}</span>
              </Button>
              <div
                className="cursor-grab text-muted-foreground active:cursor-grabbing"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  dragControls.start(event);
                }}
              >
                <GripVertical className="size-4" />
              </div>
            </div>
          </div>
        </div>
        {summary ? <p className="sr-only">{summary}</p> : null}
      </div>
    </Reorder.Item>
  );
}
