"use client"

import { Card } from "@/components/ui/card"
import { GraduationCap, School, CheckCircle2, XCircle, Calendar, Trophy, Crown, Medal, Star, Camera, CameraOff, ChevronRight, ChevronLeft, BookOpen, type LucideIcon } from "lucide-react"
import * as LucideIcons from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { ClassStat } from "@/components/student/student-class-card"
import { ScrollIndicator } from "@/components/student/scroll-indicator"

type LucideIconKey = keyof typeof LucideIcons;

interface StudentProfileHeroProps {
    student: {
        fullName: string
        email?: string
        username?: string
        imageUrl?: string
        grade?: string
        school?: string
    }
    stats: {
        activeCourses: number
        totalSessions: number
        attendanceRate: number
        completedSessions: number
    }
    classes?: ClassStat[];
    disableCamera?: boolean;
}

export function StudentProfileHero({ student, stats, disableCamera, classes }: StudentProfileHeroProps) {
    const t = useTranslations('student.profile')
    const tGrades = useTranslations('student.grades')

    const [isCameraOn, setIsCameraOn] = useState(false)
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const classesScrollRef = useRef<HTMLDivElement>(null)

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }
        setIsCameraOn(false)
    }

    const toggleCamera = async () => {
        if (isCameraOn) {
            localStorage.setItem('flexidual_camera_on', 'false')
            stopCamera()
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true })
                streamRef.current = stream
                localStorage.setItem('flexidual_camera_on', 'true')
                setIsCameraOn(true)
            } catch (err) {
                console.error("Failed to access camera", err)
            }
        }
    }

    useEffect(() => {
        if (isCameraOn && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current
        }
    }, [isCameraOn])

    useEffect(() => {
        if (disableCamera && isCameraOn) {
            stopCamera()
        }
    }, [disableCamera, isCameraOn])

    // Restore camera preference from localStorage on mount
    useEffect(() => {
        if (disableCamera) return
        const stored = localStorage.getItem('flexidual_camera_on')
        if (stored !== 'true') return
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                streamRef.current = stream
                setIsCameraOn(true)
            })
            .catch(() => localStorage.removeItem('flexidual_camera_on'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Cleanup on unmount — only stop the media tracks, never touch the stored preference
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop())
                streamRef.current = null
            }
        }
    }, [])

    const gradeLabel = student.grade
        ? tGrades(student.grade as string)
        : null

    // Calculate exact numbers from the rate
    const attendedSessions = Math.round((stats.attendanceRate / 100) * stats.completedSessions)
    const missedSessions = stats.completedSessions - attendedSessions
    const upcomingSessions = stats.totalSessions - stats.completedSessions

    const expectedProgressPct = stats.totalSessions > 0 ? Math.round((stats.completedSessions / stats.totalSessions) * 100) : 0;
    const actualProgressPct = stats.totalSessions > 0 ? Math.round((attendedSessions / stats.totalSessions) * 100) : 0;
    const isBehind = actualProgressPct < expectedProgressPct;

    // Calculate Gamified Level
    let level = { name: t('rookie'), icon: Star, color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" }
        if (stats.attendanceRate > 25) level = { name: t('scout'), icon: Medal, color: "text-info", bg: "bg-info/10", border: "border-info/30" }
        if (stats.attendanceRate > 50) level = { name: t('captain'), icon: Trophy, color: "text-secondary", bg: "bg-secondary/10", border: "border-secondary/30" }
        if (stats.attendanceRate > 85) level = { name: t('legend'), icon: Crown, color: "text-primary", bg: "bg-primary/10", border: "border-primary/30" }

    const LevelIcon = level.icon

    return (
        <Card className="col-span-1 lg:col-span-2 overflow-hidden border-2 border-b-[6px] border-primary/20 shadow-sm bg-card relative group flex flex-col sm:flex-row rounded-3xl transition-transform hover:-translate-y-1">
            {/* LEFT: Image & Basic Info Container */}
            <div className="relative p-4 sm:p-6 flex flex-col items-center justify-center sm:w-1/3 xl:w-1/4 bg-gradient-to-br from-primary/5 to-secondary/10 border-r-2 border-dashed border-primary/15">
                {/* Avatar circle — overflow-hidden clips content, so the mobile hint lives outside */}
                <div className="relative mb-4">
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 lg:w-48 lg:h-48 rounded-full shadow-lg border-4 border-card overflow-hidden transform transition-transform duration-500 hover:scale-105 group/avatar">
                        {isCameraOn ? (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover scale-x-[-1]"
                            />
                        ) : student.imageUrl ? (
                            <Image
                                src={student.imageUrl}
                                alt={student.fullName}
                                fill
                                className="object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary/10">
                                                            <span className="text-4xl sm:text-5xl font-black text-primary">
                                    {student.fullName.charAt(0)}
                                </span>
                            </div>
                        )}

                        {/* Desktop hover overlay */}
                        <div
                            className="absolute inset-0 bg-inverse/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer z-10"
                            onClick={toggleCamera}
                            title={isCameraOn ? t('turnOffCamera') : t('turnOnCamera')}
                        >
                            {isCameraOn ? (
                                <CameraOff className="w-8 h-8 text-inverse-foreground drop-shadow-md" />
                            ) : (
                                <Camera className="w-8 h-8 text-inverse-foreground drop-shadow-md" />
                            )}
                        </div>
                    </div>

                    {/* Mobile/tablet tap hint — outside overflow-hidden so it's not clipped */}
                    <button
                        className="sm:hidden absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 cursor-pointer"
                        onClick={toggleCamera}
                        aria-label={isCameraOn ? t('turnOffCamera') : t('turnOnCamera')}
                    >
                        <span className="animate-bounce inline-flex items-center gap-1 bg-gradient-to-r from-primary to-secondary text-primary-foreground text-[9px] font-black rounded-full px-2.5 py-1 whitespace-nowrap shadow-md border-2 border-primary-foreground/30">
                            {isCameraOn ? <CameraOff className="w-2.5 h-2.5" /> : <Camera className="w-2.5 h-2.5" />}
                            {isCameraOn ? t('turnOffCamera') : t('turnOnCamera')}
                        </span>
                    </button>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-center text-foreground leading-tight mb-2">
                    {student.fullName}
                </h2>

                {(student.username || student.email) && (
                    <p className="text-sm font-bold text-primary mb-3 bg-primary/10 px-3 py-1 rounded-full">
                        @{student.username || student.email?.split('@')[0]}
                    </p>
                )}

                <div className="flex flex-col items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    {student.school && (
                        <span className="flex items-center gap-1.5 bg-muted px-3 py-1 rounded-full border-2 border-border">
                            <School className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[150px]">{student.school}</span>
                        </span>
                    )}
                    {student.grade && (
                        <span className="flex items-center gap-1.5 bg-muted px-3 py-1 rounded-full border-2 border-border">
                            <GraduationCap className="w-3.5 h-3.5" />
                            {gradeLabel}
                        </span>
                    )}
                </div>
            </div>

            {/* RIGHT: Stats & Gamification Area */}
            <div className="flex-1 p-4 sm:p-6 flex flex-col justify-center gap-6">

                {/* Level Banner */}
                <div className={`flex items-center justify-between p-3 sm:p-4 rounded-2xl border-2 border-b-4 ${level.bg} ${level.border}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 bg-card rounded-xl border-2 ${level.border} shadow-sm transform -rotate-3`}>
                            <LevelIcon className={`w-6 h-6 sm:w-8 sm:h-8 ${level.color}`} />
                        </div>
                        <div>
                            <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-muted-foreground">
                                {t('currentLevel') || 'Current Level'}
                            </p>
                            <p className={`text-lg sm:text-2xl font-black ${level.color}`}>
                                {level.name}
                            </p>
                        </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-muted-foreground">
                            {t('attendanceRate') || 'Attendance Score'}
                        </p>
                        <span className="text-2xl sm:text-3xl font-black text-foreground leading-none mt-1">
                            {stats.attendanceRate}%
                        </span>
                    </div>
                </div>

                {/* Main Progress Bar (Race Track) */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end px-1">
                        <span className="text-[10px] sm:text-xs font-black text-muted-foreground uppercase tracking-wider">
                            {t('overallProgress') || 'Overall Progress'}
                        </span>
                        {isBehind && (
                            <span className="text-[10px] sm:text-xs font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-md animate-pulse">
                                {expectedProgressPct - actualProgressPct}{t('behindTarget')}
                            </span>
                        )}
                    </div>

                    {/* Dual Track Bar */}
                    <div className="h-6 sm:h-8 w-full bg-muted rounded-2xl p-1 border-2 border-b-4 border-border">
                        {/* Inner wrapper to handle padding safely */}
                        <div className="relative w-full h-full rounded-xl">

                            {/* 1. Ghost bar for expected target (where they SHOULD be) */}
                            <div
                                className="absolute left-0 top-0 h-full bg-neutral-status/30 rounded-xl transition-all duration-1000"
                                style={{ width: `${expectedProgressPct}%` }}
                            />

                            {/* 2. Actual progress solid colorful bar (where they ARE) */}
                            <div
                                className="absolute overflow-hidden left-0 top-0 h-full bg-gradient-to-r from-primary via-primary to-secondary rounded-xl transition-all duration-1000 shadow-sm"
                                style={{ width: `${actualProgressPct}%` }}
                            >
                                {/* Glossy overlay for tactile 3D feel */}
                                <div className="absolute top-0 left-0 right-0 h-1/3 bg-primary-foreground/20 rounded-t-xl" />
                            </div>

                            {/* 3. Target Marker Pin */}
                            <div
                                className="absolute -top-0.5 -bottom-0.5 w-1.5 bg-neutral-status rounded-full shadow-md z-10"
                                style={{ left: `calc(${expectedProgressPct}% - 3px)` }}
                            />
                        </div>
                    </div>

                    <div className="flex justify-between text-[10px] sm:text-xs font-bold text-muted-foreground px-1">
                        <span>{actualProgressPct}{t('actualProgress')}</span>
                        <span>{expectedProgressPct}{t('targetProgress')}</span>
                    </div>
                </div>

                {/* Tactile Stat Pills */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    <div className="flex flex-col items-center justify-center bg-success/10 rounded-2xl p-3 border-2 border-b-4 border-success/30 text-success">
                        <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{attendedSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('attended')}</span>
                    </div>

                    <div className="flex flex-col items-center justify-center bg-destructive/10 rounded-2xl p-3 border-2 border-b-4 border-destructive/30 text-destructive">
                        <XCircle className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{missedSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('missed')}</span>
                    </div>

                    <div className="flex flex-col items-center justify-center bg-info/10 rounded-2xl p-3 border-2 border-b-4 border-info/30 text-info">
                        <Calendar className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{upcomingSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('upcoming')}</span>
                    </div>
                </div>

            </div>

            {classes !== undefined && (
                <div className={`relative transition-all duration-300 ease-in-out border-t-2 sm:border-t-0 sm:border-l-2 border-dashed border-primary/15 bg-primary/5 flex flex-col overflow-hidden max-h-52 sm:overflow-visible sm:max-h-none ${isSidebarExpanded ? 'w-full sm:w-64 p-4' : 'w-full sm:w-[88px] p-2 sm:p-4'}`}>

                    {/* Desktop Toggle Button */}
                    <button
                        onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                        className="absolute top-1/2 -left-3 sm:-translate-y-1/2 bg-card border-2 border-primary/20 rounded-full p-0.5 text-primary hover:bg-primary/10 z-20 hidden sm:flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                    >
                        {isSidebarExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                    </button>

                    {/* Mobile Toggle */}
                    <button
                        onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                        className="sm:hidden flex-shrink-0 w-full flex items-center justify-center py-2 mb-2 text-[10px] font-black uppercase tracking-wider text-primary border-2 border-dashed border-primary/20 rounded-xl bg-card/50"
                    >
                        {isSidebarExpanded ? t('hideComparison') : t('compareClasses')}
                    </button>

                    {classes.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3">
                            <div className="p-3 rounded-2xl bg-primary/10 border-2 border-primary/20">
                                <BookOpen className="w-5 h-5 text-primary" />
                            </div>
                            {isSidebarExpanded && (
                                <div className="text-center px-1 animate-in fade-in duration-300">
                                    <p className="text-[10px] sm:text-xs font-bold text-muted-foreground leading-snug">
                                        {t('noClassesYet')}
                                    </p>
                                    <p className="text-[9px] sm:text-[10px] font-medium text-muted-foreground/70 mt-1 leading-snug">
                                        {t('noClassesYetHint')}
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="relative flex-1 min-h-0 overflow-hidden">
                            <div ref={classesScrollRef} className="absolute inset-0 overflow-y-auto scrollbar-hide pt-1 pr-2 pb-6 space-y-4 sm:space-y-5">
                                {classes.map((cls) => {
                                    // Resolve dynamic icon
                                    const IconComponent: LucideIcon = cls.icon && cls.icon in LucideIcons
                                        ? LucideIcons[cls.icon as LucideIconKey] as LucideIcon
                                        : LucideIcons.BookOpen;

                                    // 1. Calculate Target vs Actual for this specific class
                                    const expectedPct = cls.stats.totalClasses > 0
                                        ? Math.round((cls.stats.completedClasses / cls.stats.totalClasses) * 100)
                                        : 0;
                                    const actualPct = cls.stats.totalClasses > 0
                                        ? Math.round((cls.stats.attendedClasses / cls.stats.totalClasses) * 100)
                                        : 0;

                                    const isBehind = actualPct < expectedPct;
                                    const isPerfect = cls.stats.completedClasses > 0 && cls.stats.attendedClasses === cls.stats.completedClasses;

                                    // 2. SVG Ring Math
                                    const radius = 20;
                                    const circumference = 2 * Math.PI * radius;
                                    const actualOffset = circumference - (actualPct / 100) * circumference;
                                    const targetOffset = circumference - (expectedPct / 100) * circumference;

                                    // 3. Dynamic Glow & Color States
                                    const glowClass = isBehind
                                        ? "shadow-[0_0_12px] shadow-destructive/60 animate-pulse border-destructive"
                                        : isPerfect
                                            ? "shadow-[0_0_10px] shadow-primary/40 border-primary"
                                            : "border-primary/20 shadow-sm";

                                    const iconColor = isBehind ? 'text-destructive' : 'text-primary';
                                    const ringColor = isBehind ? 'stroke-destructive' : 'stroke-primary';

                                    return (
                                        <div key={cls.classId} className="flex items-center gap-3 group/sidebar-item" title={cls.curriculumTitle}>

                                            {/* COLLAPSED STATE: Circular Progress Ring Avatar */}
                                            <div className="relative w-14 h-14 flex items-center justify-center shrink-0 mx-auto sm:mx-0">
                                                {/* Background Track + Rings */}
                                                <svg className="w-14 h-14 transform -rotate-90 absolute" viewBox="0 0 48 48">
                                                    {/* Track */}
                                                    <circle
                                                        cx="24" cy="24" r={radius}
                                                        className="stroke-muted fill-none"
                                                        strokeWidth="4"
                                                    />
                                                    {/* Target Marker (Ghost Ring) */}
                                                    {expectedPct > 0 && (
                                                        <circle
                                                            cx="24" cy="24" r={radius}
                                                            className="stroke-neutral-status/30 fill-none transition-all duration-1000"
                                                            strokeWidth="4"
                                                            strokeDasharray={circumference}
                                                            strokeDashoffset={targetOffset}
                                                            strokeLinecap="round"
                                                        />
                                                    )}
                                                    {/* Actual Progress Ring */}
                                                    <circle
                                                        cx="24" cy="24" r={radius}
                                                        className={`fill-none transition-all duration-1000 ease-out ${ringColor}`}
                                                        strokeWidth="4"
                                                        strokeDasharray={circumference}
                                                        strokeDashoffset={actualOffset}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>

                                                {/* Inner Icon Container with Glow */}
                                                <div className={`w-9 h-9 rounded-full bg-card border-2 flex items-center justify-center z-10 transition-all ${glowClass} group-hover/sidebar-item:scale-110`}>
                                                    <IconComponent className={`w-4 h-4 ${iconColor}`} />
                                                </div>
                                            </div>

                                            {/* EXPANDED STATE: Title & Dual Track Bar */}
                                            {isSidebarExpanded && (
                                                <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-left-2 duration-300">
                                                    <div className="flex justify-between items-end mb-1">
                                                        <p className="text-[10px] sm:text-xs font-bold text-foreground uppercase truncate pr-2">
                                                            {cls.curriculumTitle}
                                                        </p>
                                                        <span className={`text-[10px] sm:text-xs font-black tabular-nums ${iconColor}`}>
                                                            {actualPct}%
                                                        </span>
                                                    </div>

                                                    {/* Dual Track Bar (Matching Hero Style) */}
                                                    <div className="h-2 w-full bg-muted rounded-full relative overflow-hidden border border-border">
                                                        {/* Ghost Target Bar */}
                                                        <div
                                                            className="absolute left-0 top-0 h-full bg-neutral-status/30 rounded-full transition-all duration-1000"
                                                            style={{ width: `${expectedPct}%` }}
                                                        />
                                                        {/* Actual Solid Bar */}
                                                        <div
                                                            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ${isBehind ? 'bg-gradient-to-r from-destructive to-warning' : 'bg-gradient-to-r from-primary to-secondary'}`}
                                                            style={{ width: `${actualPct}%` }}
                                                        />
                                                        {/* Target Marker Pin */}
                                                        <div
                                                            className="absolute -top-0.5 -bottom-0.5 w-1 bg-neutral-status rounded-full shadow-sm z-10"
                                                            style={{ left: `calc(${expectedPct}% - 2px)` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {classes !== undefined && classes.length > 0 && (
                        <ScrollIndicator containerRef={classesScrollRef} />
                    )}
                </div>
            )}
        </Card>
    )
}