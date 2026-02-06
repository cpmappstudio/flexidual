"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface EntityDialogProps {
  trigger?: React.ReactNode
  title: string
  description?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isSubmitting?: boolean
  submitLabel?: string
  children: React.ReactNode
  leftActions?: React.ReactNode
  maxWidth?: string
}

export function EntityDialog({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  submitLabel = "Save",
  children,
  leftActions,
  maxWidth = "sm:max-w-[600px]",
}: EntityDialogProps) {
  // Internal state for open/close if not controlled externally
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = open !== undefined

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen)
    }
    onOpenChange?.(newOpen)
  }

  const effectiveOpen = isControlled ? open : internalOpen

  return (
    <Dialog open={effectiveOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={`${maxWidth} flex flex-col max-h-[90vh] gap-0 p-0`}>
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <ScrollArea className="flex-1 p-6">
            {children}
          </ScrollArea>

          <DialogFooter className="p-6 pt-4 border-t gap-2 sm:gap-0 bg-muted/10">
            <div className="flex flex-1 items-center gap-2">
              {leftActions}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}