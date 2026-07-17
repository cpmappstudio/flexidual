"use client";

import { LayoutTemplate } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Doc } from "@/convex/_generated/dataModel";

interface ProgramUseTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Doc<"formTemplates">[];
  onSelect: (template: Doc<"formTemplates">) => void;
}

export function ProgramUseTemplateDialog({
  open,
  onOpenChange,
  templates,
  onSelect,
}: ProgramUseTemplateDialogProps) {
  const t = useTranslations("Programs.create.useTemplateDialog");

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
    >
      <CommandInput placeholder={t("searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>
        <CommandGroup heading={t("groupLabel")}>
          {templates.map((template) => (
            <CommandItem
              key={template._id}
              onSelect={() => onSelect(template)}
              className="gap-3"
            >
              <div className="rounded-lg border bg-muted/30 p-2 text-muted-foreground">
                <LayoutTemplate className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{template.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {template.description || t("noDescription")}
                </p>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
