"use client"

import { LogOut } from "lucide-react"
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

interface LeaveClassButtonProps {
  className: string
  iconClassName?: string
  onConfirm: () => void | Promise<void>
}

export function LeaveClassButton({
  className,
  iconClassName = "size-5",
  onConfirm,
}: LeaveClassButtonProps) {
  const t = useTranslations("classroom")
  const common = useTranslations("common")

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          title={t("leave")}
          aria-label={t("leave")}
          className={className}
        >
          <LogOut className={iconClassName} />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("leaveClassTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("leaveClassDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => void onConfirm()}
          >
            {t("leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
