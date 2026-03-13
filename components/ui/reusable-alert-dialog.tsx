"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

interface AlertConfig {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

interface ReusableAlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: AlertConfig
}

export function ReusableAlertDialog({
  open,
  onOpenChange,
  config,
}: ReusableAlertDialogProps) {
  const t = useTranslations()
  const [isLoading, setIsLoading] = React.useState(false)

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await config.onConfirm()
      onOpenChange(false)
    } catch (error) {
      console.error("Alert confirmation error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    config.onCancel?.()
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex flex-col items-center justify-center">
        <AlertDialogHeader className="flex items-center justify-center">
          <AlertDialogTitle>{config.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line text-center">{config.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-6">
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            {config.cancelLabel || t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={config.variant === "destructive" ? "bg-destructive text-white hover:bg-destructive/90" : ""}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {config.confirmLabel || t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}