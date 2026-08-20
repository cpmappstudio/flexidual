"use client";

import { Button } from "@/components/ui/button";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
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
  isPanelOpen: boolean;
  openPanelLabel: string;
  closePanelLabel: string;
  onPanelOpenChange: (open: boolean) => void;
  action?: ReactNode;
  sessionAction?: ReactNode;
}

export function ClassroomHeader({
  title,
  subtitle,
  isActive,
  activeLabel,
  waitingLabel,
  isRecording,
  isPhoneLandscape,
  isPanelOpen,
  openPanelLabel,
  closePanelLabel,
  onPanelOpenChange,
  action,
  sessionAction,
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
            <span className="truncate text-xs font-bold text-primary">
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 md:flex md:items-center">
            <div className="flex min-w-0 items-center gap-2 md:flex-1">
              <div className="flex min-w-0 flex-col">
                <h2 className="truncate text-base font-bold text-primary">
                  {title}
                </h2>
                {subtitle && (
                  <p className="truncate text-xs text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              {isRecording && (
                <div className="shrink-0">
                  <RecordingIndicator />
                </div>
              )}
            </div>
            {action && (
              <div className="col-start-1 row-start-2 flex shrink-0 items-center md:col-auto md:row-auto">
                {action}
              </div>
            )}
            <div className="hidden shrink-0 items-center gap-2 border-l border-border pl-2 xl:flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-controls="classroom-interaction-panel"
                aria-expanded={isPanelOpen}
                aria-label={isPanelOpen ? closePanelLabel : openPanelLabel}
                title={isPanelOpen ? closePanelLabel : openPanelLabel}
                onClick={() => onPanelOpenChange(!isPanelOpen)}
                className="size-11 text-primary hover:bg-primary/10 hover:text-primary"
              >
                {isPanelOpen ? (
                  <PanelRightClose className="size-5" />
                ) : (
                  <PanelRightOpen className="size-5" />
                )}
              </Button>
            </div>
            {sessionAction && (
              <div
                className={`col-start-2 shrink-0 lg:hidden ${
                  action ? "row-start-2" : "row-start-1"
                } md:col-auto md:row-auto`}
              >
                {sessionAction}
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
