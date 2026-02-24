"use client"

import { Card } from "@/components/ui/card"
import { GraduationCap, School, CheckCircle2, XCircle, Calendar, Trophy, Crown, Medal, Star } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"

interface StudentProfileHeroProps {
    student: {
        fullName: string
        email: string
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
}

export function StudentProfileHero({ student, stats }: StudentProfileHeroProps) {
    const t = useTranslations('student.profile')
    
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
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 mb-4 rounded-full shadow-lg border-4 border-white dark:border-gray-800 overflow-hidden transform transition-transform duration-500 hover:scale-105">
                    {student.imageUrl ? (
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
                </div>
                
                <h2 className="text-xl sm:text-2xl font-black text-center text-gray-800 dark:text-gray-100 leading-tight mb-2">
                    {student.fullName}
                </h2>
                
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
                            {student.grade}th Grade
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
                            Course Progress
                        </span>
                        {isBehind && (
                            <span className="text-[10px] sm:text-xs font-bold text-red-500 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-md animate-pulse">
                                {expectedProgressPct - actualProgressPct}% Behind Target
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
                        <span>{actualProgressPct}% Actual</span>
                        <span>{expectedProgressPct}% Target</span>
                    </div>
                </div>

                {/* Tactile Stat Pills */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    <div className="flex flex-col items-center justify-center bg-green-50 dark:bg-green-950/30 rounded-2xl p-3 border-2 border-b-4 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{attendedSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">Attended</span>
                    </div>

                    <div className="flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/30 rounded-2xl p-3 border-2 border-b-4 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400">
                        <XCircle className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{missedSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">Missed</span>
                    </div>

                    <div className="flex flex-col items-center justify-center bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-3 border-2 border-b-4 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400">
                        <Calendar className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                        <span className="text-xl sm:text-2xl font-black leading-none">{upcomingSessions}</span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">Upcoming</span>
                    </div>
                </div>

            </div>
        </Card>
    )
}