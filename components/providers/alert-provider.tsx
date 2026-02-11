"use client"

import * as React from "react"
import { ReusableAlertDialog } from "@/components/ui/reusable-alert-dialog"

interface AlertConfig {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

interface AlertContextType {
  showAlert: (config: AlertConfig) => void
}

const AlertContext = React.createContext<AlertContextType | undefined>(undefined)

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alertConfig, setAlertConfig] = React.useState<AlertConfig | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)

  const showAlert = React.useCallback((config: AlertConfig) => {
    setAlertConfig(config)
    setIsOpen(true)
  }, [])

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alertConfig && (
        <ReusableAlertDialog
          open={isOpen}
          onOpenChange={setIsOpen}
          config={alertConfig}
        />
      )}
    </AlertContext.Provider>
  )
}

export function useAlert() {
  const context = React.useContext(AlertContext)
  if (!context) {
    throw new Error("useAlert must be used within AlertProvider")
  }
  return context
}