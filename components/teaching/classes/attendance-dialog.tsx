"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  AttendanceStatusControl,
  type AttendanceStatus,
} from "@/components/attendance/attendance-status-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";

interface AttendanceDialogProps {
  scheduleId: Id<"classSchedule">;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
}

interface AttendanceDraft {
  status: AttendanceStatus;
  excuseReason: string;
}

export function AttendanceDialog({
  scheduleId,
  trigger,
  open,
  onOpenChange,
  title,
}: AttendanceDialogProps) {
  const t = useTranslations();
  const format = useFormatter();
  const now = useCurrentMinute();
  const [internalOpen, setInternalOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [savingStudentId, setSavingStudentId] = useState<Id<"users">>();
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const statsResult = useQuery(
    api.schedule.getAttendanceDetails,
    isOpen ? { scheduleId, now } : "skip",
  );
  const stats = useRetainedQueryResult(statsResult, scheduleId);
  const updateAttendance = useMutation(api.schedule.updateAttendance);

  useEffect(() => {
    if (!stats) return;
    setDrafts(
      Object.fromEntries(
        stats.map((student) => [
          student.studentId,
          {
            status: student.status,
            excuseReason: student.excuseReason ?? "",
          },
        ]),
      ),
    );
  }, [stats]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const handleSave = async (studentId: Id<"users">) => {
    const draft = drafts[studentId];
    if (!draft || (draft.status === "excused" && !draft.excuseReason.trim())) {
      return;
    }
    setSavingStudentId(studentId);
    try {
      await updateAttendance({
        scheduleId,
        studentId,
        status: draft.status,
        excuseReason:
          draft.status === "excused" ? draft.excuseReason : undefined,
      });
      toast.success(t("schedule.attendance.updated"));
    } catch {
      toast.error(t("schedule.attendance.updateFailed"));
    } finally {
      setSavingStudentId(undefined);
    }
  };

  const statusLabels = {
    present: t("schedule.attendance.present"),
    partial: t("schedule.attendance.partial"),
    absent: t("schedule.attendance.absent"),
    excused: t("schedule.attendance.excused"),
  };
  const statusStyles: Record<AttendanceStatus, string> = {
    present: "bg-success/10 text-success",
    partial: "bg-warning/10 text-warning",
    absent: "bg-destructive/10 text-destructive",
    excused: "bg-info/10 text-info",
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="grid max-h-[80dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>
            {t("schedule.attendance.title")}: {title || t("class.session")}
          </DialogTitle>
          <DialogDescription>
            {t("schedule.attendance.description")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0">
          <div className="min-w-[48rem] p-6">
            {!stats ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("student.name")}</TableHead>
                    <TableHead>
                      {t("schedule.attendance.timeTracked")}
                    </TableHead>
                    <TableHead>{t("schedule.attendance.status")}</TableHead>
                    <TableHead className="w-64">
                      {t("schedule.attendance.editAction")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((student) => {
                    const draft = drafts[student.studentId];
                    if (!draft) return null;
                    const isReasonMissing =
                      draft.status === "excused" && !draft.excuseReason.trim();
                    const isUnchanged =
                      draft.status === student.status &&
                      (draft.status !== "excused" ||
                        draft.excuseReason.trim() ===
                          (student.excuseReason ?? ""));
                    return (
                      <TableRow key={student.studentId}>
                        <TableCell className="align-top">
                          <p className="font-medium">{student.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {student.email}
                          </p>
                        </TableCell>
                        <TableCell className="align-top">
                          <p>{student.totalMinutes}m</p>
                          {student.lastSeen && (
                            <p className="text-xs text-muted-foreground">
                              {t("schedule.attendance.lastSeen")}:{" "}
                              {format.dateTime(new Date(student.lastSeen), {
                                hour: "numeric",
                                minute: "numeric",
                              })}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant="secondary"
                            className={statusStyles[student.status]}
                          >
                            {statusLabels[student.status]}
                          </Badge>
                          {student.excuseReason && (
                            <p className="mt-2 max-w-52 text-xs text-muted-foreground">
                              {student.excuseReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <AttendanceStatusControl
                            status={draft.status}
                            excuseReason={draft.excuseReason}
                            labels={statusLabels}
                            reasonLabel={t("schedule.attendance.excuseReason")}
                            reasonPlaceholder={t(
                              "schedule.attendance.excuseReasonPlaceholder",
                            )}
                            onStatusChange={(status) =>
                              setDrafts((current) => ({
                                ...current,
                                [student.studentId]: {
                                  ...current[student.studentId],
                                  status,
                                },
                              }))
                            }
                            onExcuseReasonChange={(excuseReason) =>
                              setDrafts((current) => ({
                                ...current,
                                [student.studentId]: {
                                  ...current[student.studentId],
                                  excuseReason,
                                },
                              }))
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="mt-2 w-full"
                            disabled={
                              isUnchanged ||
                              isReasonMissing ||
                              savingStudentId !== undefined
                            }
                            onClick={() => void handleSave(student.studentId)}
                          >
                            {savingStudentId === student.studentId && (
                              <Loader2 className="size-4 animate-spin" />
                            )}
                            {t("common.save")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
