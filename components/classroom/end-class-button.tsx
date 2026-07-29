"use client"

import { Loader2, StopCircle } from "lucide-react"
import { useTranslations } from "next-intl"

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
} from "@/components/ui/alert-dialog"

interface EndClassButtonProps {
  className: string
  disabled?: boolean
  iconClassName?: string
  onConfirm: () => void | Promise<void>
}

export function EndClassButton({
  className,
  disabled = false,
  iconClassName = "size-5",
  onConfirm,
}: EndClassButtonProps) {
  const t = useTranslations("classroom")
  const common = useTranslations("common")

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
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
            onClick={() => void onConfirm()}
          >
            {t("endClass")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
