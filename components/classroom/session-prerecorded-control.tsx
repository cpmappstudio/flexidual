"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Upload, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const SessionPrerecordedDialog = dynamic(
  () => import("./session-prerecorded-dialog"),
);

export function PrerecordedIndicator() {
  const t = useTranslations("sessionVideo");
  return (
    <span
      className="inline-flex shrink-0 items-center text-primary"
      title={t("available")}
      aria-label={t("available")}
    >
      <Video className="size-4" aria-hidden="true" />
    </span>
  );
}

export function SessionPrerecordedControl({
  scheduleId,
  canManage,
  hasPrerecorded = false,
  iconOnly = false,
  onOpen,
}: {
  scheduleId: Id<"classSchedule">;
  canManage: boolean;
  hasPrerecorded?: boolean;
  iconOnly?: boolean;
  onOpen?: (scheduleId: Id<"classSchedule">) => void;
}) {
  const t = useTranslations("sessionVideo");
  const [open, setOpen] = useState(false);
  const [previousScheduleId, setPreviousScheduleId] = useState(scheduleId);
  if (previousScheduleId !== scheduleId) {
    setPreviousScheduleId(scheduleId);
    setOpen(false);
  }
  if (!canManage) return null;
  const label = t(hasPrerecorded ? "manage" : "upload");
  const Icon = hasPrerecorded ? Video : Upload;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={iconOnly ? "icon" : "default"}
        className={cn(
          "shrink-0 bg-transparent shadow-none hover:bg-transparent",
          iconOnly
            ? "text-warning hover:text-warning/80"
            : "h-auto w-full justify-start gap-3 rounded-none px-0 py-3 text-left font-semibold whitespace-normal text-foreground hover:text-primary has-[>svg]:px-0",
        )}
        title={label}
        aria-label={label}
        onClick={() => (onOpen ? onOpen(scheduleId) : setOpen(true))}
      >
        <Icon
          className={iconOnly ? "size-6" : "size-5 text-primary"}
          strokeWidth={iconOnly ? 2.25 : 2}
          aria-hidden="true"
        />
        {!iconOnly && label}
      </Button>
      {!onOpen && open && (
        <SessionPrerecordedDialog
          key={scheduleId}
          scheduleId={scheduleId}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
