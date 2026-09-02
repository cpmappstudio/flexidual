"use client";

import { useId } from "react";
import {
  ClockFading,
  FilePenLine,
  type LucideIcon,
  UserCheck,
  UserX,
} from "lucide-react";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AttendanceStatus = "present" | "partial" | "absent" | "excused";

interface AttendanceStatusControlProps {
  status: AttendanceStatus;
  excuseReason?: string;
  labels: Record<AttendanceStatus, string>;
  descriptions: Record<AttendanceStatus, string>;
  reasonLabel: string;
  reasonPlaceholder: string;
  onStatusChange: (status: AttendanceStatus) => void;
  onExcuseReasonChange: (reason: string) => void;
  ariaLabel?: string;
  className?: string;
}

const ATTENDANCE_STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  icon: LucideIcon;
  className: string;
}> = [
  {
    value: "present",
    icon: UserCheck,
    className:
      "border-success/30 bg-success/5 text-success/40 hover:border-success/50 hover:bg-success/10 hover:text-success/70 data-[state=on]:border-success data-[state=on]:bg-success data-[state=on]:text-white data-[state=on]:hover:bg-success/90",
  },
  {
    value: "partial",
    icon: ClockFading,
    className:
      "border-warning/30 bg-warning/5 text-warning-foreground/40 hover:border-warning/50 hover:bg-warning/10 hover:text-warning-foreground/70 data-[state=on]:border-warning data-[state=on]:bg-warning data-[state=on]:text-white data-[state=on]:hover:bg-warning/90",
  },
  {
    value: "absent",
    icon: UserX,
    className:
      "border-destructive/30 bg-destructive/5 text-destructive/40 hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive/70 data-[state=on]:border-destructive data-[state=on]:bg-destructive data-[state=on]:text-white data-[state=on]:hover:bg-destructive/90",
  },
  {
    value: "excused",
    icon: FilePenLine,
    className:
      "border-info/30 bg-info/5 text-info/40 hover:border-info/50 hover:bg-info/10 hover:text-info/70 data-[state=on]:border-info data-[state=on]:bg-info data-[state=on]:text-white data-[state=on]:hover:bg-info/90",
  },
];

export function AttendanceStatusControl({
  status,
  excuseReason,
  labels,
  descriptions,
  reasonLabel,
  reasonPlaceholder,
  onStatusChange,
  onExcuseReasonChange,
  ariaLabel,
  className,
}: AttendanceStatusControlProps) {
  const reasonId = useId();

  return (
    <div className={cn("min-w-0", className)}>
      <ToggleGroup
        type="single"
        value={status}
        aria-label={ariaLabel}
        className="grid grid-cols-4"
        onValueChange={(value) => {
          if (value) onStatusChange(value as AttendanceStatus);
        }}
      >
        {ATTENDANCE_STATUS_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger asChild>
                <span className="block min-w-0">
                  <ToggleGroupItem
                    value={option.value}
                    variant="outline"
                    aria-label={labels[option.value]}
                    className={cn(
                      "h-10 w-full min-w-10 rounded-lg p-0 transition-[color,background-color,border-color,box-shadow] data-[state=on]:shadow-md",
                      option.className,
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </ToggleGroupItem>
                </span>
              </TooltipTrigger>
              <TooltipContent sideOffset={6} className="max-w-64">
                <p className="font-semibold">{labels[option.value]}</p>
                <p className="text-primary-foreground/80">
                  {descriptions[option.value]}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>

      {status === "excused" && (
        <div className="mt-2 space-y-1.5">
          <Label htmlFor={reasonId}>{reasonLabel}</Label>
          <Textarea
            id={reasonId}
            required
            value={excuseReason ?? ""}
            placeholder={reasonPlaceholder}
            onChange={(event) => onExcuseReasonChange(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}
