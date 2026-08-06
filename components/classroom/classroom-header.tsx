"use client";

import { ClassroomViewHeader } from "./classroom-view";
import type { ReactNode } from "react";

interface ClassroomHeaderProps {
  title: string;
  subtitle?: string;
  isActive: boolean;
  activeLabel: string;
  waitingLabel: string;
  isRecording: boolean;
  isPhoneLandscape: boolean;
  action?: ReactNode;
}

export function ClassroomHeader({
  title,
  subtitle,
  isActive,
  activeLabel,
  waitingLabel,
  isRecording,
  isPhoneLandscape,
  action,
}: ClassroomHeaderProps) {
  const statusLabel = isActive ? activeLabel : waitingLabel;
  const statusColor = isActive ? "bg-success animate-pulse" : "bg-chart-4";

  return (
    <ClassroomViewHeader isPhoneLandscape={isPhoneLandscape}>
      {isPhoneLandscape ? (
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span
            role="status"
            aria-label={statusLabel}
            className={`size-2 shrink-0 rounded-full ${statusColor}`}
          />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate text-xs font-bold text-card-foreground">
              {title}
            </span>
            {subtitle && (
              <span className="truncate text-[10px] text-muted-foreground">
                &middot; {subtitle}
              </span>
            )}
          </div>
          {isRecording && <RecordingIndicator compact />}
          {action}
        </div>
      ) : (
        <div className="px-0.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex min-w-0 flex-col">
                <h2 className="truncate text-sm font-bold text-card-foreground">
                  {title}
                </h2>
                {subtitle && (
                  <p className="truncate text-xs text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {action && (
              <div className="flex basis-full shrink-0 items-center sm:basis-auto">
                {action}
              </div>
            )}
            {isRecording && (
              <div className="ml-auto shrink-0">
                <RecordingIndicator />
              </div>
            )}
          </div>
        </div>
      )}
    </ClassroomViewHeader>
  );
}

function RecordingIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center rounded-full border border-destructive/20 bg-destructive/10 ${
        compact ? "gap-1 px-1.5 py-0.5" : "gap-1.5 px-2.5 py-1"
      }`}
    >
      <span
        className={`rounded-full bg-destructive animate-pulse ${compact ? "size-1.5" : "size-2"}`}
      />
      <span
        className={`font-bold uppercase text-destructive ${compact ? "text-[9px]" : "text-xs"}`}
      >
        REC
      </span>
    </div>
  );
}
