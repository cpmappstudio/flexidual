"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  BookOpenCheck,
  ClipboardClock,
  MessageSquareText,
  PencilLine,
  PlayCircle,
  Users,
  VideoOff,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AttendanceRecordEditor } from "@/components/attendance/attendance-record-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_APPEARANCE,
  AttendanceStatusBadge,
} from "@/components/attendance/attendance-status";
import {
  ClassSessionTabsList,
  ClassSessionTabsTrigger,
} from "@/components/classroom/class-session-tabs";
import { cn } from "@/lib/utils";

export type SessionRecordData = FunctionReturnType<
  typeof api.sessionRecords.get
>;

type CompletedSessionRecord = Extract<
  SessionRecordData,
  { state: "completed" }
>;
type SessionRecording =
  | CompletedSessionRecord["recordings"][number]
  | Extract<SessionRecordData, { state: "pending" }>["recordings"][number];

type SessionRecordViewProps = {
  record: SessionRecordData | undefined;
  onWatchRecording: (recordings: SessionRecording[]) => void;
  onCompleteReport?: () => void;
  variant?: "default" | "panel";
  attendanceMode?: "auto" | "hidden";
  showOwnAttendance?: boolean;
  allowAttendanceEditing?: boolean;
  className?: string;
};

export function useSessionRecord(
  scheduleId: Id<"classSchedule"> | undefined,
  asOf: number | undefined,
  enabled = true,
) {
  return useQuery(
    api.sessionRecords.get,
    enabled && scheduleId && asOf !== undefined
      ? { scheduleId, now: asOf }
      : "skip",
  );
}

export function getSessionRecordings(
  record: SessionRecordData | undefined,
): SessionRecording[] {
  return record?.state === "completed" || record?.state === "pending"
    ? record.recordings
    : [];
}

function RecordingStatus({
  recordings,
  onWatchRecording,
  compact = false,
}: {
  recordings: SessionRecording[];
  onWatchRecording: (recordings: SessionRecording[]) => void;
  compact?: boolean;
}) {
  const t = useTranslations("sessionRecord");
  const hasRecording = recordings.length > 0;
  const Icon = hasRecording ? PlayCircle : VideoOff;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        compact ? "border-b border-border/70 pb-4" : "rounded-2xl border p-4",
        !compact &&
          (hasRecording
            ? "border-primary/25 bg-primary/5"
            : "border-border bg-muted/30"),
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full bg-background",
          hasRecording ? "text-primary" : "text-muted-foreground",
          compact && "size-9 bg-muted/50",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {t(hasRecording ? "recordingAvailable" : "noRecording")}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasRecording
            ? t("recordingParts", { count: recordings.length })
            : t("noRecordingDescription")}
        </p>
      </div>
      {hasRecording && (
        <Button
          type="button"
          className="h-10 w-full gap-2 sm:w-auto"
          onClick={() => onWatchRecording(recordings)}
        >
          <PlayCircle className="size-4" aria-hidden="true" />
          {t("watchRecording")}
        </Button>
      )}
    </div>
  );
}

function LessonsPanel({
  record,
  compact = false,
}: {
  record: CompletedSessionRecord;
  compact?: boolean;
}) {
  const t = useTranslations("sessionRecord");
  const notes = record.staffDetails?.notes;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-start gap-3">
          <BookOpenCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold">{t("lessonsTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("lessonsDescription")}
            </p>
          </div>
        </div>
      )}

      {record.lessons.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          {t("noLessons")}
        </p>
      ) : (
        <div className="grid gap-2">
          {record.lessons.map((lesson) => (
            <div
              key={lesson.lessonId}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border bg-success/5 p-3"
            >
              <span className="grid size-8 place-items-center rounded-full bg-success/15 text-sm font-bold text-success">
                {lesson.order}
              </span>
              <div className="min-w-0">
                <p className="line-clamp-2 break-words text-sm font-medium leading-snug">
                  {lesson.title}
                </p>
                <p className="mt-1 text-xs text-success">{t("taught")}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {notes && (
        <div className="rounded-2xl border bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">{t("notesTitle")}</h3>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {notes}
          </p>
        </div>
      )}
    </div>
  );
}

function AttendancePanel({
  record,
  compact = false,
  allowEditing = false,
}: {
  record: CompletedSessionRecord;
  compact?: boolean;
  allowEditing?: boolean;
}) {
  const t = useTranslations("sessionRecord");
  const attendanceT = useTranslations("attendance.status");
  const [editingStudentId, setEditingStudentId] = useState<Id<"users">>();

  useEffect(() => {
    setEditingStudentId(undefined);
  }, [record.scheduleId]);

  const attendance = record.staffDetails?.attendance;
  const students =
    attendance?.students ??
    (record.ownAttendance
      ? [
          {
            studentId: null,
            fullName: t("yourAttendance"),
            ...record.ownAttendance,
          },
        ]
      : []);

  if (!attendance && record.ownAttendance === undefined) return null;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold">
              {t(attendance ? "attendanceTitle" : "yourAttendance")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("attendanceDescription")}
            </p>
          </div>
        </div>
      )}

      {attendance && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ATTENDANCE_STATUSES.map((status) => {
            const appearance = ATTENDANCE_STATUS_APPEARANCE[status];
            const Icon = appearance.icon;
            return (
              <div
                key={status}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2",
                  appearance.softClassName,
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="text-sm font-bold tabular-nums">
                  {attendance.summary[status]}
                </span>
                <span className="truncate text-xs">{attendanceT(status)}</span>
              </div>
            );
          })}
        </div>
      )}

      {students.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          {t(attendance ? "noAttendance" : "noOwnAttendance")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          {students.map((student) => {
            return (
              <div
                key={student.studentId ?? "self"}
                className="grid gap-3 border-b p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {student.fullName}
                  </p>
                  {student.excuseReason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("excuseReason", { reason: student.excuseReason })}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <AttendanceStatusBadge
                    status={student.status}
                    label={attendanceT(student.status)}
                  />
                  {allowEditing && student.studentId !== null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5"
                      aria-expanded={editingStudentId === student.studentId}
                      onClick={() =>
                        setEditingStudentId((current) =>
                          current === student.studentId
                            ? undefined
                            : student.studentId,
                        )
                      }
                    >
                      <PencilLine className="size-3.5" aria-hidden="true" />
                      {t("editAttendance")}
                    </Button>
                  )}
                </div>
                {allowEditing &&
                  student.studentId !== null &&
                  editingStudentId === student.studentId && (
                    <div className="rounded-xl border bg-muted/20 p-3 sm:col-span-2 sm:ml-auto sm:w-72">
                      <AttendanceRecordEditor
                        scheduleId={record.scheduleId}
                        studentId={student.studentId}
                        studentName={student.fullName}
                        status={student.status}
                        excuseReason={student.excuseReason}
                        onSaved={() => setEditingStudentId(undefined)}
                      />
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SessionRecordView({
  record,
  onWatchRecording,
  onCompleteReport,
  variant = "default",
  attendanceMode = "auto",
  showOwnAttendance = true,
  allowAttendanceEditing = false,
  className,
}: SessionRecordViewProps) {
  const t = useTranslations("sessionRecord");
  const [activeTab, setActiveTab] = useState("lessons");
  const isPanel = variant === "panel";

  useEffect(() => {
    setActiveTab("lessons");
  }, [record?.scheduleId]);

  if (record === undefined) {
    return (
      <div className={cn("space-y-3", className)} aria-label={t("loading")}>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  if (record.state !== "completed" && record.state !== "pending") {
    return null;
  }

  if (record.state === "pending") {
    return (
      <section className={cn("space-y-4", className)}>
        <RecordingStatus
          recordings={record.recordings}
          onWatchRecording={onWatchRecording}
          compact={isPanel}
        />
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <ClipboardClock className="size-5 shrink-0 text-warning-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("pendingTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {t(
                record.canCompleteReport
                  ? "pendingDescription"
                  : "pendingViewerDescription",
              )}
            </p>
          </div>
          {record.canCompleteReport && onCompleteReport && (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full border-warning/50 text-warning-foreground hover:bg-warning/10 sm:w-auto"
              onClick={onCompleteReport}
            >
              {t("completeReport")}
            </Button>
          )}
        </div>
      </section>
    );
  }

  const canViewAttendance =
    attendanceMode === "auto" &&
    (record.staffDetails !== null ||
      (showOwnAttendance && record.ownAttendance !== undefined));

  return (
    <section className={cn("space-y-4", className)}>
      <RecordingStatus
        recordings={record.recordings}
        onWatchRecording={onWatchRecording}
        compact={isPanel}
      />
      {canViewAttendance ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <ClassSessionTabsList>
            <ClassSessionTabsTrigger value="lessons">
              {t("lessonsTab")}
            </ClassSessionTabsTrigger>
            <ClassSessionTabsTrigger value="attendance">
              {t(record.staffDetails ? "attendanceTab" : "yourAttendance")}
            </ClassSessionTabsTrigger>
          </ClassSessionTabsList>
          <TabsContent value="lessons" className="m-0 pt-4">
            <LessonsPanel record={record} compact={isPanel} />
          </TabsContent>
          <TabsContent value="attendance" className="m-0 pt-4">
            <AttendancePanel
              record={record}
              compact={isPanel}
              allowEditing={
                allowAttendanceEditing && record.staffDetails !== null
              }
            />
          </TabsContent>
        </Tabs>
      ) : (
        <LessonsPanel record={record} compact={isPanel} />
      )}
    </section>
  );
}
