"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ClassroomActionButton } from "./classroom-action-bar";

interface LeaveClassButtonProps {
  className?: string;
  iconClassName?: string;
  appearance?: "header" | "icon" | "toolbar";
  onConfirm: () => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
  previewOpen?: boolean;
  onPreviewOpenChange?: (open: boolean) => void;
}

export function LeaveClassButton({
  className,
  iconClassName = "size-5",
  appearance = "icon",
  onConfirm,
  onOpenChange,
  previewOpen = false,
  onPreviewOpenChange,
}: LeaveClassButtonProps) {
  const t = useTranslations("classroom");
  const common = useTranslations("common");

  return (
    <AlertDialog
      open={previewOpen || undefined}
      onOpenChange={previewOpen ? onPreviewOpenChange : onOpenChange}
    >
      <AlertDialogTrigger asChild>
        {appearance === "toolbar" ? (
          <ClassroomActionButton
            label={t("leave")}
            icon={<LogOut />}
            tone="destructive"
          />
        ) : appearance === "header" ? (
          <button
            type="button"
            title={t("leave")}
            aria-label={t("leave")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="size-4" />
            <span>{t("leave")}</span>
          </button>
        ) : (
          <button
            type="button"
            title={t("leave")}
            aria-label={t("leave")}
            className={className}
          >
            <LogOut className={iconClassName} />
          </button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("leaveClassTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("leaveClassDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (previewOpen) {
                onPreviewOpenChange?.(false);
                return;
              }
              void onConfirm();
            }}
          >
            {t("leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
