"use client";

import { useTranslations } from "next-intl";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PROGRAM_FORM_CATALOG } from "./catalog";
import type { ProgramFormElementType } from "./types";

interface AddElementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (fieldType: ProgramFormElementType) => void;
}

export function AddElementDialog({
  open,
  onOpenChange,
  onSelect,
}: AddElementDialogProps) {
  const t = useTranslations("Programs.create.builder");

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("editor.command.title")}
      description={t("editor.command.description")}
    >
      <CommandInput placeholder={t("editor.command.searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("editor.command.empty")}</CommandEmpty>
        <CommandGroup heading={t("editor.command.groups.fields")}>
          {PROGRAM_FORM_CATALOG.filter((item) => item.group === "fields").map(
            (item) => (
              <CommandItem
                key={item.fieldType}
                onSelect={() => onSelect(item.fieldType)}
                className="gap-3"
              >
                <div className="rounded-lg border bg-muted/30 p-2 text-muted-foreground">
                  <item.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{t(item.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(item.descriptionKey)}
                  </p>
                </div>
              </CommandItem>
            ),
          )}
        </CommandGroup>
        <CommandGroup heading={t("editor.command.groups.display")}>
          {PROGRAM_FORM_CATALOG.filter((item) => item.group === "display").map(
            (item) => (
              <CommandItem
                key={item.fieldType}
                onSelect={() => onSelect(item.fieldType)}
                className="gap-3"
              >
                <div className="rounded-lg border bg-muted/30 p-2 text-muted-foreground">
                  <item.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{t(item.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(item.descriptionKey)}
                  </p>
                </div>
              </CommandItem>
            ),
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
