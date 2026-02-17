"use client"

import { Card } from "@/components/ui/card"
import { GraduationCap, School, BookOpen, CalendarCheck, Trophy, Crown, Medal, Star } from "lucide-react"
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
    
    // Calculate Gamified Level
    let level = { name: t('rookie'), icon: Star, color: "text-yellow-400" }
    if (stats.attendanceRate > 25) level = { name: t('scout'), icon: Medal, color: "text-blue-400" }
    if (stats.attendanceRate > 50) level = { name: t('captain'), icon: Trophy, color: "text-orange-400" }
    if (stats.attendanceRate > 85) level = { name: t('legend'), icon: Crown, color: "text-purple-300" }

    const LevelIcon = level.icon

    return (
        <Card className="col-span-1 lg:col-span-2 overflow-hidden border-none shadow-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white relative group min-h-[280px] sm:min-h-[320px] lg:min-h-[340px] flex flex-col sm:flex-row">
             {/* Decorative Background Elements */}
            <div className="absolute top-0 right-0 w-48 h-48 sm:w-64 sm:h-64 bg-white/10 rounded-full blur-3xl -mr-12 -mt-12 sm:-mr-16 sm:-mt-16 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 sm:w-48 sm:h-48 bg-black/10 rounded-full blur-2xl -ml-8 -mb-8 sm:-ml-10 sm:-mb-10 pointer-events-none" />

            {/* LEFT: Image Container */}
            <div className="relative p-4 sm:p-6 flex-shrink-0 flex justify-center sm:justify-start items-center sm:items-start sm:w-2/5 lg:w-1/3 xl:w-1/4">
                <div className="relative w-32 h-44 sm:w-36 sm:h-48 lg:w-full lg:h-56 xl:h-64 rounded-2xl shadow-2xl border-4 border-white/20 transform sm:rotate-[-2deg] transition-transform duration-500 hover:rotate-0 hover:scale-[1.02] overflow-hidden">
                    {student.imageUrl ? (
                        <Image 
                            src={student.imageUrl} 
                            alt={student.fullName}
                            fill
                            className="object-cover rounded-xl"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/20 backdrop-blur-sm rounded-xl">
                            <span className="text-4xl sm:text-5xl lg:text-6xl font-black text-white/50">{student.fullName.charAt(0)}</span>
                        </div>
                    )}
                    
                    {/* Floating Grade Badge */}
                    {student.grade && (
                        <div className="absolute bottom-0 w-full bg-black/60 backdrop-blur-md p-1.5 sm:p-2 text-center rounded-b-xl">
                            <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white">
                                <GraduationCap className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-yellow-400" />
                                {student.grade}th
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: Content Area */}
            <div className="flex-1 p-4 sm:p-6 sm:pl-0 flex flex-col justify-center relative z-10 gap-4 sm:gap-6">
                
                {/* Header Info */}
                <div className="text-center sm:text-left">
                    <h2 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-black tracking-tight mb-1 sm:mb-2 text-white drop-shadow-sm leading-tight break-words">
                        {student.fullName}
                    </h2>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start text-indigo-100 font-medium text-xs sm:text-sm gap-2 sm:gap-3">
                        {student.school && (
                            <span className="flex items-center gap-1 sm:gap-1.5 bg-white/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full backdrop-blur-sm border border-white/10">
                                <School className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-80" />
                                <span className="truncate max-w-[150px] sm:max-w-[200px]">{student.school}</span>
                            </span>
                        )}
                        <span className="opacity-60 hidden sm:inline">|</span>
                        <span className="opacity-80 truncate max-w-[180px] sm:max-w-[200px]">{student.email}</span>
                    </div>
                </div>

                {/* GAMIFICATION & STATS GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-black/20 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-5 backdrop-blur-md border border-white/5">
                    
                    {/* Level Progress */}
                    <div className="col-span-1 sm:col-span-2 space-y-2 sm:space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <div className={`p-1 sm:p-1.5 rounded-lg bg-white/10 ${level.color}`}>
                                    <LevelIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] sm:text-xs text-indigo-200 font-semibold uppercase tracking-wider">{t('currentLevel')}</p>
                                    <p className="text-base sm:text-lg font-bold leading-none">{level.name}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-xl sm:text-2xl font-black">{stats.attendanceRate}%</span>
                            </div>
                        </div>

                        {/* Custom Segmented Progress Bar */}
                        <div className="h-3 sm:h-4 w-full bg-black/30 rounded-full p-0.5 sm:p-1 relative overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                                style={{ width: `${stats.attendanceRate}%` }}
                            />
                            <div className="absolute inset-0 grid grid-cols-4 pointer-events-none">
                                <div className="border-r border-white/10 h-full"></div>
                                <div className="border-r border-white/10 h-full"></div>
                                <div className="border-r border-white/10 h-full"></div>
                            </div>
                        </div>
                        <p className="text-[10px] sm:text-xs text-indigo-200 text-right">
                            {t('sessionsCompleted', { count: stats.completedSessions })}
                        </p>
                    </div>

                    {/* Mini Stats */}
                    <div className="flex items-center gap-2 sm:gap-3 bg-white/10 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-white/5">
                        <div className="p-1.5 sm:p-2.5 bg-white/10 rounded-full">
                            <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300" />
                        </div>
                        <div>
                            <p className="text-lg sm:text-xl font-bold leading-none">{stats.activeCourses}</p>
                            <p className="text-[9px] sm:text-[10px] lg:text-xs text-indigo-100 uppercase tracking-wider font-semibold mt-0.5">{t('activeCourses')}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 bg-white/10 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-white/5">
                        <div className="p-1.5 sm:p-2.5 bg-white/10 rounded-full">
                            <CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5 text-blue-300" />
                        </div>
                        <div>
                            <p className="text-lg sm:text-xl font-bold leading-none">{stats.totalSessions}</p>
                            <p className="text-[9px] sm:text-[10px] lg:text-xs text-indigo-100 uppercase tracking-wider font-semibold mt-0.5">{t('totalSessions')}</p>
                        </div>
                    </div>
                </div>

            </div>
        </Card>
    )
}