"use client";

import { Clock3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { getEffectiveLiveEnd } from "@/lib/live-session-policy";
import { cn } from "@/lib/utils";

interface ClassroomCountdownProps {
  now: number;
  end: number;
  extensionEndsAt?: number;
}

export function ClassroomCountdown({
  now,
  end,
  extensionEndsAt,
}: ClassroomCountdownProps) {
  const t = useTranslations("classroom");
  const remainingSeconds = Math.max(
    0,
    Math.ceil((getEffectiveLiveEnd(end, extensionEndsAt) - now) / 1_000),
  );
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isExtended = extensionEndsAt !== undefined && extensionEndsAt > end;
  const label =
    remainingSeconds === 0
      ? t("scheduledTimeEnded")
      : t(isExtended ? "extensionTimeRemaining" : "timeRemaining", { time });

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:gap-1.5 sm:px-2 sm:text-xs",
        isExtended && "border-success/30 bg-success/10 text-success-foreground",
      )}
    >
      <Clock3 aria-hidden="true" className="size-3 sm:size-3.5" />
      {isExtended && <span aria-hidden="true">+</span>}
      <span aria-hidden="true" className="tabular-nums">
        {time}
      </span>
    </span>
  );
}
