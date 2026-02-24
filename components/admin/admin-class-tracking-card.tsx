"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Users, CalendarCheck } from "lucide-react"
import { format } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { useLocale } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Id } from "@/convex/_generated/dataModel"

// Strongly typed interfaces matching the Convex query return types
interface ScheduleItemType {
    scheduleId: Id<"classSchedule">;
    title: string;
    start: number;
    attendanceSummary?: {
        present: number;
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
        students: Id<"users">[];
    };
    schedules: ScheduleItemType[];
}

export function AdminClassTrackingCard({ classData, schedules }: AdminClassTrackingCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const locale = useLocale()
    const dateLocale = locale === 'es' ? es : locale === 'pt-BR' ? ptBR : enUS
    
    const pastSchedules = schedules.filter(s => s.start < Date.now()).sort((a, b) => b.start - a.start)
    
    // Teacher Stats
    const totalPast = pastSchedules.length
    const teacherAttended = pastSchedules.filter(s => s.teacherAttendance?.status === "present" || s.teacherAttendance?.status === "partial").length
    
    const teacherAttendanceRate = totalPast > 0 ? Math.round((teacherAttended / totalPast) * 100) : 100

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden transition-all duration-200">
            {/* Header / Summary Section */}
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {classData.curriculumTitle || "Unknown Curriculum"}
                        </p>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground truncate">
                        {classData.name}
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" /> 
                            {classData.students?.length || 0} Enrolled
                        </span>
                        <span className="flex items-center gap-1.5">
                            <CalendarCheck className="w-4 h-4" /> 
                            {totalPast} Sessions
                        </span>
                    </div>
                </div>

                {/* Teacher Overall Score */}
                <div className="flex items-center gap-6 shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-medium text-muted-foreground mb-0.5">Teacher Attendance</span>
                        <div className={`text-xl font-bold ${teacherAttendanceRate < 80 ? 'text-destructive' : teacherAttendanceRate < 95 ? 'text-amber-500' : 'text-green-600 dark:text-green-500'}`}>
                            {teacherAttendanceRate}%
                        </div>
                    </div>
                    <div className="text-muted-foreground">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
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
                                <p className="text-center text-sm text-muted-foreground py-6">No past sessions to track yet.</p>
                            ) : (
                                pastSchedules.map(schedule => {
                                    const tStatus = schedule.teacherAttendance?.status
                                    const isPresent = tStatus === "present" || tStatus === "partial" || tStatus === "excused"
                                    
                                    return (
                                        <div key={schedule.scheduleId} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:px-4 hover:bg-muted/30 transition-colors gap-3">
                                            {/* Date & Title */}
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="flex flex-col items-center justify-center min-w-[50px] text-center p-1.5 bg-background rounded border border-border shrink-0">
                                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">{format(schedule.start, "MMM", { locale: dateLocale })}</span>
                                                    <span className="text-base font-bold text-foreground leading-none my-0.5">{format(schedule.start, "d", { locale: dateLocale })}</span>
                                                </div>
                                                <div className="truncate">
                                                    <p className="text-sm font-medium text-foreground truncate">{schedule.title}</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">{format(schedule.start, "h:mm a", { locale: dateLocale })}</p>
                                                </div>
                                            </div>

                                            {/* Stats Area */}
                                            <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
                                                {/* Subtle Student Attendance */}
                                                {schedule.attendanceSummary && (
                                                    <div className="flex flex-col items-end sm:items-start">
                                                        <span className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">Students</span>
                                                        <div className="flex items-center gap-1.5 text-sm">
                                                            <Users className="w-3.5 h-3.5 text-muted-foreground" />
                                                            <span className="font-medium text-foreground">
                                                                {schedule.attendanceSummary.present}
                                                                <span className="text-muted-foreground">/{schedule.attendanceSummary.total}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Teacher Status Badge */}
                                                <div className="flex flex-col items-end sm:items-start min-w-[80px]">
                                                    <span className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">Teacher</span>
                                                    <Badge variant={isPresent ? "outline" : "destructive"} className={`font-normal ${isPresent ? 'text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-900 dark:bg-green-950/30' : ''}`}>
                                                        {isPresent ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                                                        {tStatus === "partial" ? "Partial" : isPresent ? "Present" : "Missed"}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}