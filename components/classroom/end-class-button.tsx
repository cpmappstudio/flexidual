"use client";

import { Loader2, PhoneOff, X } from "lucide-react";
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
  appearance?: "header" | "icon" | "toolbar";
  onConfirm: () => void | Promise<void>;
  onLeave?: () => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
  previewOpen?: boolean;
  onPreviewOpenChange?: (open: boolean) => void;
}

export function EndClassButton({
  className,
  disabled = false,
  iconClassName = "size-5",
  appearance = "icon",
  onConfirm,
  onLeave,
  onOpenChange,
  previewOpen = false,
  onPreviewOpenChange,
}: EndClassButtonProps) {
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
            label={t("endClass")}
            icon={
              disabled ? <Loader2 className="animate-spin" /> : <PhoneOff />
            }
            tone="destructive"
            emphasis="strong"
            disabled={disabled}
          />
        ) : appearance === "header" ? (
          <button
            type="button"
            title={t("leave")}
            aria-label={t("leave")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive bg-destructive px-3 text-xs font-semibold text-white transition-colors hover:bg-destructive/90 disabled:cursor-wait disabled:opacity-60 [&_svg]:text-white"
            disabled={disabled}
          >
            {disabled ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PhoneOff className="size-4" />
            )}
            <span>{t("leave")}</span>
          </button>
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
              <PhoneOff className={iconClassName} />
            )}
          </button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogCancel
          aria-label={common("cancel")}
          title={common("cancel")}
          className="absolute right-3 top-3 size-8 rounded-md p-0"
        >
          <X className="size-4" />
        </AlertDialogCancel>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {onLeave ? t("leaveOrEndClassTitle") : t("endClassTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {onLeave
              ? t("leaveOrEndClassDescription")
              : t("endClassDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter
          className={
            onLeave
              ? "flex-col [&>button]:w-full sm:flex-row sm:[&>button]:w-auto"
              : undefined
          }
        >
          {onLeave && (
            <AlertDialogCancel
              onClick={() => {
                if (previewOpen) {
                  onPreviewOpenChange?.(false);
                  return;
                }
                void onLeave();
              }}
            >
              {t("leaveWithoutEnding")}
            </AlertDialogCancel>
          )}
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
            {onLeave ? t("endClassForEveryone") : t("endClass")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
