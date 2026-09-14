"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";

import { AttendanceRecordEditor } from "@/components/attendance/attendance-record-editor";
import type { AttendanceStatus } from "@/components/attendance/attendance-status";
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

export function AttendanceDialog({
  scheduleId,
  trigger,
  open,
  onOpenChange,
  title,
}: AttendanceDialogProps) {
  const t = useTranslations();
  const attendanceT = useTranslations("attendance.status");
  const format = useFormatter();
  const now = useCurrentMinute();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const statsResult = useQuery(
    api.schedule.getAttendanceDetails,
    isOpen ? { scheduleId, now } : "skip",
  );
  const stats = useRetainedQueryResult(statsResult, scheduleId);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
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
                            {attendanceT(student.status)}
                          </Badge>
                          {student.excuseReason && (
                            <p className="mt-2 max-w-52 text-xs text-muted-foreground">
                              {student.excuseReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <AttendanceRecordEditor
                            scheduleId={scheduleId}
                            studentId={student.studentId}
                            studentName={student.fullName}
                            status={student.status}
                            excuseReason={student.excuseReason}
                          />
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
