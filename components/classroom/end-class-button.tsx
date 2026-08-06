"use client";

import { Loader2, PhoneOff, StopCircle } from "lucide-react";
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

interface EndClassButtonProps {
  className?: string;
  disabled?: boolean;
  iconClassName?: string;
  appearance?: "icon" | "toolbar";
  onConfirm: () => void | Promise<void>;
  previewOpen?: boolean;
  onPreviewOpenChange?: (open: boolean) => void;
}

export function EndClassButton({
  className,
  disabled = false,
  iconClassName = "size-5",
  appearance = "icon",
  onConfirm,
  previewOpen = false,
  onPreviewOpenChange,
}: EndClassButtonProps) {
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
            label={t("endClass")}
            icon={
              disabled ? <Loader2 className="animate-spin" /> : <PhoneOff />
            }
            tone="destructive"
            emphasis="strong"
            disabled={disabled}
          />
        ) : (
          <button
            type="button"
            title={t("endClass")}
            aria-label={t("endClass")}
            className={className}
            disabled={disabled}
          >
            {disabled ? (
              <Loader2 className={`${iconClassName} animate-spin`} />
            ) : (
              <StopCircle className={iconClassName} />
            )}
          </button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("endClassTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("endClassDescription")}
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
            {t("endClass")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
