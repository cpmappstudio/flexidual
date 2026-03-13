"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslations } from "next-intl";

interface EntityDialogProps {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  submitLabel?: string;
  children: React.ReactNode;
  leftActions?: React.ReactNode;
  maxWidth?: string;
}

export function EntityDialog({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  submitDisabled = false,
  submitLabel = "Save",
  children,
  leftActions,
  maxWidth = "sm:max-w-[600px]",
}: EntityDialogProps) {
  const t = useTranslations();
  // Internal state for open/close if not controlled externally
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  const effectiveOpen = isControlled ? open : internalOpen;

  return (
    <Dialog open={effectiveOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={`${maxWidth} flex flex-col max-h-[90vh] gap-0 p-0`}
      >
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="text-center">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-auto">
          <ScrollArea className="flex-1 p-6">
            {children}
          </ScrollArea>

          <div className="p-4 border-t bg-muted/10">
            {/* Mobile: stacked — Cancel+Save grid, then Delete below */}
            <div className="flex flex-col gap-2 md:hidden">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || submitDisabled}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {submitLabel}
                </Button>
              </div>
              {leftActions && (
                <div className="[&>button]:w-full mt-2">{leftActions}</div>
              )}
            </div>
            {/* md+: single row — Delete left, Cancel+Save right */}
            <div className="hidden md:flex md:items-center md:gap-2">
              {leftActions && <div>{leftActions}</div>}
              <div className="flex gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || submitDisabled}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {submitLabel}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
