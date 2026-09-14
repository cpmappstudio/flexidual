import {
  ClockFading,
  FilePenLine,
  type LucideIcon,
  UserCheck,
  UserX,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type AttendanceStatus = "present" | "partial" | "absent" | "excused";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "partial",
  "absent",
  "excused",
];

export const ATTENDANCE_STATUS_APPEARANCE: Record<
  AttendanceStatus,
  {
    icon: LucideIcon;
    softClassName: string;
    summaryClassName: string;
  }
> = {
  present: {
    icon: UserCheck,
    softClassName: "bg-success/10 text-success",
    summaryClassName:
      "bg-success/50 text-success-foreground hover:bg-success/60",
  },
  partial: {
    icon: ClockFading,
    softClassName: "bg-warning/15 text-warning-foreground",
    summaryClassName: "bg-warning/20 text-warning hover:bg-warning/30",
  },
  absent: {
    icon: UserX,
    softClassName: "bg-destructive/10 text-destructive",
    summaryClassName:
      "bg-destructive/25 text-destructive hover:bg-destructive/35",
  },
  excused: {
    icon: FilePenLine,
    softClassName: "bg-info/10 text-gray",
    summaryClassName: "bg-info/40 text-gray hover:bg-info/50",
  },
};

export function AttendanceStatusBadge({
  status,
  label,
  className,
}: {
  status: AttendanceStatus;
  label: string;
  className?: string;
}) {
  const appearance = ATTENDANCE_STATUS_APPEARANCE[status];
  const Icon = appearance.icon;

  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        appearance.softClassName,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
