"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type AttendanceStatus = "present" | "partial" | "absent" | "excused";

interface AttendanceStatusControlProps {
  status: AttendanceStatus;
  excuseReason?: string;
  labels: Record<AttendanceStatus, string>;
  reasonLabel: string;
  reasonPlaceholder: string;
  onStatusChange: (status: AttendanceStatus) => void;
  onExcuseReasonChange: (reason: string) => void;
  className?: string;
}

export function AttendanceStatusControl({
  status,
  excuseReason,
  labels,
  reasonLabel,
  reasonPlaceholder,
  onStatusChange,
  onExcuseReasonChange,
  className,
}: AttendanceStatusControlProps) {
  const reasonId = useId();

  return (
    <div className={className}>
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["present", "partial", "absent", "excused"] as const).map(
            (attendanceStatus) => (
              <SelectItem key={attendanceStatus} value={attendanceStatus}>
                {labels[attendanceStatus]}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>

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
