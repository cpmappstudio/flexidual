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
  appearance?: "icon" | "toolbar";
  onConfirm: () => void | Promise<void>;
  previewOpen?: boolean;
  onPreviewOpenChange?: (open: boolean) => void;
}

export function LeaveClassButton({
  className,
  iconClassName = "size-5",
  appearance = "icon",
  onConfirm,
  previewOpen = false,
  onPreviewOpenChange,
}: LeaveClassButtonProps) {
  const t = useTranslations("classroom");
  const common = useTranslations("common");

  return (
    <AlertDialog
      open={previewOpen || undefined}
      onOpenChange={previewOpen ? onPreviewOpenChange : undefined}
    >
      <AlertDialogTrigger asChild>
        {appearance === "toolbar" ? (
          <ClassroomActionButton
            label={t("leave")}
            icon={<LogOut />}
            tone="destructive"
          />
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
