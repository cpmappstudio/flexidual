"use client";

import { Clock3, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ClassroomEndingSoonNotice({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-2 z-[70] flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-warning/40 bg-warning px-3 py-1.5 text-xs font-semibold text-warning-foreground shadow-lg"
    >
      <Clock3 className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

interface ClassroomEnableAudioOverlayProps {
  title: string;
  actionLabel: string;
  onEnable: () => void | Promise<void>;
}

export function ClassroomEnableAudioOverlay({
  title,
  actionLabel,
  onEnable,
}: ClassroomEnableAudioOverlayProps) {
  return (
    <div className="absolute inset-0 z-[999] flex items-center justify-center bg-inverse/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center text-card-foreground shadow-2xl sm:p-8">
        <VolumeX className="mx-auto mb-3 size-10 text-secondary sm:mb-4 sm:size-12" />
        <h3 className="mb-3 text-lg font-bold sm:text-xl">{title}</h3>
        <Button
          type="button"
          size="lg"
          className="w-full font-bold"
          onClick={() => void onEnable()}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

interface ClassroomFullscreenPromptProps {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ClassroomFullscreenPrompt({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onOpenChange,
  onCancel,
  onConfirm,
}: ClassroomFullscreenPromptProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
