"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AttendanceStatusControl,
  type AttendanceStatus,
} from "@/components/attendance/attendance-status-control";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AttendanceRecordEditor({
  scheduleId,
  studentId,
  studentName,
  status,
  excuseReason,
  onSaved,
  onCancel,
  className,
}: {
  scheduleId: Id<"classSchedule">;
  studentId: Id<"users">;
  studentName: string;
  status: AttendanceStatus;
  excuseReason?: string | null;
  onSaved?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  const t = useTranslations();
  const attendanceT = useTranslations("attendance");
  const updateAttendance = useMutation(api.schedule.updateAttendance);
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftReason, setDraftReason] = useState(excuseReason ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftStatus(status);
    setDraftReason(excuseReason ?? "");
  }, [excuseReason, status]);

  const labels = {
    present: attendanceT("status.present"),
    partial: attendanceT("status.partial"),
    absent: attendanceT("status.absent"),
    excused: attendanceT("status.excused"),
  };
  const descriptions = {
    present: attendanceT("description.present"),
    partial: attendanceT("description.partial"),
    absent: attendanceT("description.absent"),
    excused: attendanceT("description.excused"),
  };
  const normalizedReason = draftReason.trim();
  const isReasonMissing = draftStatus === "excused" && !normalizedReason;
  const isUnchanged =
    draftStatus === status &&
    (draftStatus !== "excused" ||
      normalizedReason === (excuseReason ?? "").trim());

  const handleSave = async () => {
    if (isSaving || isReasonMissing || isUnchanged) return;
    setIsSaving(true);
    try {
      await updateAttendance({
        scheduleId,
        studentId,
        status: draftStatus,
        excuseReason: draftStatus === "excused" ? normalizedReason : undefined,
      });
      toast.success(t("schedule.attendance.updated"));
      onSaved?.();
    } catch {
      toast.error(t("schedule.attendance.updateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn("min-w-0", className)}>
      <AttendanceStatusControl
        status={draftStatus}
        excuseReason={draftReason}
        labels={labels}
        descriptions={descriptions}
        ariaLabel={attendanceT("controlLabel", { name: studentName })}
        reasonLabel={t("schedule.attendance.excuseReason")}
        reasonPlaceholder={t("schedule.attendance.excuseReasonPlaceholder")}
        onStatusChange={setDraftStatus}
        onExcuseReasonChange={setDraftReason}
      />
      <div className={cn("mt-2 grid gap-2", onCancel && "grid-cols-2")}>
        {onCancel && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={isSaving || isReasonMissing || isUnchanged}
          onClick={() => void handleSave()}
        >
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
