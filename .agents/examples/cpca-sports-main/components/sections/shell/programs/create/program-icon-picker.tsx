"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProgramIconAvatar } from "@/components/sections/shell/programs/program-icon-avatar";
import { getProgramIconOption } from "@/lib/programs/icon-catalog";
import { ProgramIconOptionGrid } from "@/components/sections/shell/programs/program-icon-option-grid";

interface ProgramIconPickerProps {
  iconKey?: string | null;
  disabled?: boolean;
  onChange: (iconKey: string) => void;
}

export function ProgramIconPicker({
  iconKey,
  disabled = false,
  onChange,
}: ProgramIconPickerProps) {
  const t = useTranslations("Programs.create.header.iconPicker");
  const [open, setOpen] = useState(false);
  const selectedIcon = getProgramIconOption(iconKey);

  return (
    <>
      <div className="relative h-15 w-15 shrink-0">
        <ProgramIconAvatar
          iconKey={selectedIcon.key}
          className="h-15 w-15 rounded-lg"
          iconClassName="size-8"
        />
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute bottom-0 right-0 h-6 w-6 opacity-70 transition-all duration-200 hover:scale-100 hover:opacity-100"
          onClick={() => setOpen(true)}
          disabled={disabled}
          aria-label={t("edit")}
        >
          <Pencil className="h-2 w-2" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <ProgramIconOptionGrid
            selectedIconKey={selectedIcon.key}
            onSelect={(nextIconKey) => {
              onChange(nextIconKey);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
