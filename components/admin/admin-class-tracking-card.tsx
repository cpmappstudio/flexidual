"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  GraduationCap,
} from "lucide-react";
import { format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Id } from "@/convex/_generated/dataModel";
import { TZDate } from "@date-fns/tz";

// Strongly typed interfaces matching the Convex query return types
interface ScheduleItemType {
  scheduleId: Id<"classSchedule">;
  title: string;
  start: number;
  timeZone: string;
  attendanceSummary?: {
    present: number;
    partial: number;
    absent: number;
    excused: number;
    pendingVerification: number;
    verifiedTotal: number;
    total: number;
  };
  teacherAttendance?: {
    status: string;
    minutes: number;
  };
}

interface AdminClassTrackingCardProps {
  classData: {
    name: string;
    curriculumTitle?: string;
    studentCount: number;
  };
  schedules: ScheduleItemType[];
}

export function AdminClassTrackingCard({
  classData,
  schedules,
}: AdminClassTrackingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const locale = useLocale();
  const t = useTranslations();
  const dateLocale = locale === "es" ? es : locale === "pt-BR" ? ptBR : enUS;

  const pastSchedules = schedules
    .filter((s) => s.start < Date.now())
    .sort((a, b) => b.start - a.start);

  // Teacher Stats
  const totalPast = pastSchedules.length;
  const teacherAttended = pastSchedules.filter(
    (s) =>
      s.teacherAttendance?.status === "present" ||
      s.teacherAttendance?.status === "partial",
  ).length;

  const teacherAttendanceRate =
    totalPast > 0 ? Math.round((teacherAttended / totalPast) * 100) : 100;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden transition-all duration-200">
      {/* Header / Summary Section */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-primary/70 uppercase tracking-widest mb-0.5">
            {classData.curriculumTitle || "Unknown Curriculum"}
          </p>
          <h3 className="text-base font-bold text-foreground truncate leading-snug">
            {classData.name}
          </h3>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {classData.studentCount}
              </span>{" "}
              students
            </span>
            <span className="text-border select-none">|</span>
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{totalPast}</span>{" "}
              sessions
            </span>
          </div>
        </div>

        {/* Teacher Overall Score */}
        <div className="flex items-center gap-6 shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-muted-foreground mb-0.5">
              Teacher Attendance
            </span>
            <div
              className={`text-xl font-bold ${teacherAttendanceRate < 80 ? "text-destructive" : teacherAttendanceRate < 95 ? "text-warning" : "text-success"}`}
            >
              {teacherAttendanceRate}%
            </div>
          </div>
          <div className="text-muted-foreground">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Schedules Area (Flat List Design) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border bg-muted/10"
          >
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin divide-y divide-border">
              {pastSchedules.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  No past sessions to track yet.
                </p>
              ) : (
                pastSchedules.map((schedule) => {
                  const tStatus = schedule.teacherAttendance?.status;
                  const isPresent =
                    tStatus === "present" ||
                    tStatus === "partial" ||
                    tStatus === "excused";
                  const startDate = new TZDate(
                    schedule.start,
                    schedule.timeZone,
                  );

                  return (
                    <div
                      key={schedule.scheduleId}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:px-4 hover:bg-muted/30 transition-colors gap-3"
                    >
                      {/* Date & Title */}
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex flex-col items-center justify-center min-w-[50px] text-center p-1.5 bg-background rounded border border-border shrink-0">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                            {format(startDate, "MMM", { locale: dateLocale })}
                          </span>
                          <span className="text-base font-bold text-foreground leading-none my-0.5">
                            {format(startDate, "d", { locale: dateLocale })}
                          </span>
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-medium text-foreground truncate">
                            {schedule.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(startDate, "h:mm a", {
                              locale: dateLocale,
                            })}{" "}
                            · {schedule.timeZone}
                          </p>
                        </div>
                      </div>

                      {/* Stats Area */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
                        {/* Subtle Student Attendance */}
                        {schedule.attendanceSummary && (
                          <div className="flex flex-col items-end sm:items-start">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">
                              Students
                            </span>
                            <div className="flex items-center gap-2 text-xs font-medium">
                              <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
                              <span
                                className="text-success"
                                title={t("schedule.attendance.present")}
                              >
                                {schedule.attendanceSummary.present}
                              </span>
                              <span
                                className="text-warning"
                                title={t("schedule.attendance.partial")}
                              >
                                {schedule.attendanceSummary.partial}
                              </span>
                              <span
                                className="text-destructive"
                                title={t("schedule.attendance.absent")}
                              >
                                {schedule.attendanceSummary.absent}
                              </span>
                              <span
                                className="text-info"
                                title={t("schedule.attendance.excused")}
                              >
                                {schedule.attendanceSummary.excused}
                              </span>
                              {schedule.attendanceSummary.pendingVerification >
                                0 && (
                                <span
                                  className="text-muted-foreground"
                                  title={t(
                                    "schedule.attendance.pendingVerification",
                                  )}
                                >
                                  ·{" "}
                                  {
                                    schedule.attendanceSummary
                                      .pendingVerification
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Teacher Status Badge */}
                        <div className="flex flex-col items-end sm:items-start min-w-[80px]">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">
                            Teacher
                          </span>
                          <Badge
                            variant={isPresent ? "outline" : "destructive"}
                            className={`font-normal ${isPresent ? "border-success/30 bg-success/10 text-success" : ""}`}
                          >
                            {isPresent ? (
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                            ) : (
                              <XCircle className="w-3 h-3 mr-1" />
                            )}
                            {tStatus === "partial"
                              ? "Partial"
                              : isPresent
                                ? "Present"
                                : "Missed"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
