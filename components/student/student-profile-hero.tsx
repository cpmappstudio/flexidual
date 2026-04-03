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
    let level = { name: t('rookie'), icon: Star, color: "text-yellow-500", bg: "bg-yellow-100 dark:bg-yellow-900/50", border: "border-yellow-300 dark:border-yellow-700" }
    if (stats.attendanceRate > 25) level = { name: t('scout'), icon: Medal, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/50", border: "border-blue-300 dark:border-blue-700" }
    if (stats.attendanceRate > 50) level = { name: t('captain'), icon: Trophy, color: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900/50", border: "border-orange-300 dark:border-orange-700" }
    if (stats.attendanceRate > 85) level = { name: t('legend'), icon: Crown, color: "text-purple-500", bg: "bg-purple-100 dark:bg-purple-900/50", border: "border-purple-300 dark:border-purple-700" }

    const LevelIcon = level.icon

    return (
        <Card className="col-span-1 lg:col-span-2 overflow-hidden border-2 border-b-[6px] border-purple-200 dark:border-purple-900 shadow-sm bg-white dark:bg-gray-900 relative group flex flex-col sm:flex-row rounded-3xl transition-transform hover:-translate-y-1">
            {/* LEFT: Image & Basic Info Container */}
            <div className="relative p-4 sm:p-6 flex flex-col items-center justify-center sm:w-1/3 xl:w-1/4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-r-2 border-dashed border-purple-100 dark:border-purple-900/50">
                {/* Avatar circle — overflow-hidden clips content, so the mobile hint lives outside */}
                <div className="relative mb-4">
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 lg:w-48 lg:h-48 rounded-full shadow-lg border-4 border-white dark:border-gray-800 overflow-hidden transform transition-transform duration-500 hover:scale-105 group/avatar">
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
                            <div className="w-full h-full flex items-center justify-center bg-purple-100 dark:bg-purple-900">
                                <span className="text-4xl sm:text-5xl font-black text-purple-600 dark:text-purple-300">
                                    {student.fullName.charAt(0)}
                                </span>
                            </div>
                        )}

                        {/* Desktop hover overlay */}
                        <div 
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer z-10"
                            onClick={toggleCamera}
                            title={isCameraOn ? t('turnOffCamera') : t('turnOnCamera')}
                        >
                            {isCameraOn ? (
                                <CameraOff className="w-8 h-8 text-white drop-shadow-md" />
                            ) : (
                                <Camera className="w-8 h-8 text-white drop-shadow-md" />
                            )}
                        </div>
                    </div>

                    {/* Mobile/tablet tap hint — outside overflow-hidden so it's not clipped */}
                    <button
                        className="sm:hidden absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 cursor-pointer"
                        onClick={toggleCamera}
                        aria-label={isCameraOn ? t('turnOffCamera') : t('turnOnCamera')}
                    >
                        <span className="animate-bounce inline-flex items-center gap-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-black rounded-full px-2.5 py-1 whitespace-nowrap shadow-md border-2 border-white/30">
                            {isCameraOn ? <CameraOff className="w-2.5 h-2.5" /> : <Camera className="w-2.5 h-2.5" />}
                            {isCameraOn ? t('turnOffCamera') : t('turnOnCamera')}
                        </span>
                    </button>
                </div>
                
                <h2 className="text-xl sm:text-2xl font-black text-center text-gray-800 dark:text-gray-100 leading-tight mb-2">
                    {student.fullName}
                </h2>
                
                {(student.username || student.email) && (
                    <p className="text-sm font-bold text-purple-600 dark:text-purple-400 mb-3 bg-purple-100 dark:bg-purple-900/40 px-3 py-1 rounded-full">
                        @{student.username || student.email?.split('@')[0]}
                    </p>
                )}
                
                <div className="flex flex-col items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400">
                    {student.school && (
                        <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full border-2 border-gray-200 dark:border-gray-700">
                            <School className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[150px]">{student.school}</span>
                        </span>
                    )}
                    {student.grade && (
                        <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full border-2 border-gray-200 dark:border-gray-700">
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
                        <div className={`p-2 bg-white dark:bg-gray-800 rounded-xl border-2 ${level.border} shadow-sm transform -rotate-3`}>
                            <LevelIcon className={`w-6 h-6 sm:w-8 sm:h-8 ${level.color}`} />
                        </div>
                        <div>
                            <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {t('currentLevel') || 'Current Level'}
                            </p>
                            <p className={`text-lg sm:text-2xl font-black ${level.color}`}>
                                {level.name}
                            </p>
                        </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {t('attendanceRate') || 'Attendance Score'}
                        </p>
                        <span className="text-2xl sm:text-3xl font-black text-gray-800 dark:text-gray-100 leading-none mt-1">
                            {stats.attendanceRate}%
                        </span>
                    </div>
                </div>

                {/* Main Progress Bar (Race Track) */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end px-1">
                        <span className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wider">
                            {t('overallProgress') || 'Overall Progress'}
                        </span>
                        {isBehind && (
                            <span className="text-[10px] sm:text-xs font-bold text-red-500 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-md animate-pulse">
                                {expectedProgressPct - actualProgressPct}{t('behindTarget')}
                            </span>
                        )}
                    </div>
                    
                    {/* Dual Track Bar */}
                    <div className="h-6 sm:h-8 w-full bg-gray-100 dark:bg-gray-800/50 rounded-2xl p-1 border-2 border-b-4 border-gray-200 dark:border-gray-700">
                        {/* Inner wrapper to handle padding safely */}
                        <div className="relative w-full h-full rounded-xl">
                            
                            {/* 1. Ghost bar for expected target (where they SHOULD be) */}
                            <div 
                                className="absolute left-0 top-0 h-full bg-gray-300 dark:bg-gray-600 rounded-xl transition-all duration-1000"
                                style={{ width: `${expectedProgressPct}%` }}
                            />
                            
                            {/* 2. Actual progress solid colorful bar (where they ARE) */}
                            <div 
                                className="absolute overflow-hidden left-0 top-0 h-full bg-gradient-to-r from-purple-400 via-fuchsia-500 to-pink-500 rounded-xl transition-all duration-1000 shadow-sm"
                                style={{ width: `${actualProgressPct}%` }}
                            >
                                {/* Glossy overlay for tactile 3D feel */}
                                <div className="absolute top-0 left-0 right-0 h-1/3 bg-white/20 rounded-t-xl" />
                            </div>

                            {/* 3. Target Marker Pin */}
                            <div 
                                className="absolute -top-0.5 -bottom-0.5 w-1.5 bg-gray-500 dark:bg-gray-400 rounded-full shadow-md z-10"
                                style={{ left: `calc(${expectedProgressPct}% - 3px)` }}
                            />
                        </div>
                    </div>
                    
                    <div className="flex justify-between text-[10px] sm:text-xs font-bold text-gray-400 px-1">
                        <span>{actualProgressPct}{t('actualProgress')}</span>
                        <span>{expectedProgressPct}{t('targetProgress')}</span>
                    </div>
                </div>

                {/* Tactile Stat Pills */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    <div className="flex flex-col items-center justify-center bg-green-50 dark:bg-green-950/30 rounded-2xl p-3 border-2 border-b-4 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{attendedSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('attended')}</span>
                    </div>

                    <div className="flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/30 rounded-2xl p-3 border-2 border-b-4 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400">
                        <XCircle className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{missedSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('missed')}</span>
                    </div>

                    <div className="flex flex-col items-center justify-center bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-3 border-2 border-b-4 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400">
                        <Calendar className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{upcomingSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('upcoming')}</span>
                    </div>
                </div>

            </div>

            {classes !== undefined && (
                <div className={`relative transition-all duration-300 ease-in-out border-t-2 sm:border-t-0 sm:border-l-2 border-dashed border-purple-100 dark:border-purple-900/50 bg-purple-50/30 dark:bg-purple-950/10 flex flex-col overflow-hidden max-h-52 sm:overflow-visible sm:max-h-none ${isSidebarExpanded ? 'w-full sm:w-64 p-4' : 'w-full sm:w-[88px] p-2 sm:p-4'}`}>
                    
                    {/* Desktop Toggle Button */}
                    <button 
                        onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                        className="absolute top-1/2 -left-3 sm:-translate-y-1/2 bg-white dark:bg-gray-800 border-2 border-purple-200 dark:border-purple-800 rounded-full p-0.5 text-purple-600 hover:bg-purple-50 z-20 hidden sm:flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                    >
                        {isSidebarExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                    </button>
                    
                    {/* Mobile Toggle */}
                    <button 
                        onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                        className="sm:hidden flex-shrink-0 w-full flex items-center justify-center py-2 mb-2 text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 border-2 border-dashed border-purple-200 dark:border-purple-800 rounded-xl bg-white/50 dark:bg-gray-800/50"
                    >
                        {isSidebarExpanded ? t('hideComparison') : t('compareClasses')}
                    </button>

                    {classes.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3">
                            <div className="p-3 rounded-2xl bg-purple-100/60 dark:bg-purple-900/30 border-2 border-purple-200 dark:border-purple-800">
                                <BookOpen className="w-5 h-5 text-purple-400 dark:text-purple-500" />
                            </div>
                            {isSidebarExpanded && (
                                <div className="text-center px-1 animate-in fade-in duration-300">
                                    <p className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 leading-snug">
                                        {t('noClassesYet')}
                                    </p>
                                    <p className="text-[9px] sm:text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-1 leading-snug">
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
                                        ? "shadow-[0_0_12px_rgba(244,63,94,0.6)] animate-pulse border-rose-400 dark:border-rose-500" 
                                        : isPerfect
                                            ? "shadow-[0_0_10px_rgba(168,85,247,0.4)] border-purple-400 dark:border-purple-500"
                                            : "border-purple-200 dark:border-purple-800 shadow-sm";

                                    const iconColor = isBehind ? 'text-rose-500 dark:text-rose-400' : 'text-purple-600 dark:text-purple-400';
                                    const ringColor = isBehind ? 'stroke-rose-500' : 'stroke-purple-500';

                                    return (
                                        <div key={cls.classId} className="flex items-center gap-3 group/sidebar-item" title={cls.curriculumTitle}>
                                            
                                            {/* COLLAPSED STATE: Circular Progress Ring Avatar */}
                                            <div className="relative w-14 h-14 flex items-center justify-center shrink-0 mx-auto sm:mx-0">
                                                {/* Background Track + Rings */}
                                                <svg className="w-14 h-14 transform -rotate-90 absolute" viewBox="0 0 48 48">
                                                    {/* Track */}
                                                    <circle 
                                                        cx="24" cy="24" r={radius} 
                                                        className="stroke-gray-200 dark:stroke-gray-800 fill-none" 
                                                        strokeWidth="4" 
                                                    />
                                                    {/* Target Marker (Ghost Ring) */}
                                                    {expectedPct > 0 && (
                                                        <circle 
                                                            cx="24" cy="24" r={radius} 
                                                            className="stroke-gray-300 dark:stroke-gray-600 fill-none transition-all duration-1000" 
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
                                                <div className={`w-9 h-9 rounded-full bg-white dark:bg-gray-900 border-2 flex items-center justify-center z-10 transition-all ${glowClass} group-hover/sidebar-item:scale-110`}>
                                                    <IconComponent className={`w-4 h-4 ${iconColor}`} />
                                                </div>
                                            </div>
                                            
                                            {/* EXPANDED STATE: Title & Dual Track Bar */}
                                            {isSidebarExpanded && (
                                                <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-left-2 duration-300">
                                                    <div className="flex justify-between items-end mb-1">
                                                        <p className="text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase truncate pr-2">
                                                            {cls.curriculumTitle}
                                                        </p>
                                                        <span className={`text-[10px] sm:text-xs font-black tabular-nums ${iconColor}`}>
                                                            {actualPct}%
                                                        </span>
                                                    </div>
                                                    
                                                    {/* Dual Track Bar (Matching Hero Style) */}
                                                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full relative overflow-hidden border border-gray-200 dark:border-gray-700">
                                                        {/* Ghost Target Bar */}
                                                        <div 
                                                            className="absolute left-0 top-0 h-full bg-gray-300 dark:bg-gray-600 rounded-full transition-all duration-1000"
                                                            style={{ width: `${expectedPct}%` }}
                                                        />
                                                        {/* Actual Solid Bar */}
                                                        <div 
                                                            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ${isBehind ? 'bg-gradient-to-r from-rose-400 to-orange-500' : 'bg-gradient-to-r from-purple-400 to-pink-500'}`}
                                                            style={{ width: `${actualPct}%` }}
                                                        />
                                                        {/* Target Marker Pin */}
                                                        <div 
                                                            className="absolute -top-0.5 -bottom-0.5 w-1 bg-gray-500 dark:bg-gray-400 rounded-full shadow-sm z-10"
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