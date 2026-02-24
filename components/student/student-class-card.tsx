"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, CheckCircle2, XCircle, Calendar, CalendarClock } from "lucide-react"
import { format, Locale } from "date-fns"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Id } from "@/convex/_generated/dataModel"

interface ClassStat {
  classId: Id<"classes">
  className: string
  curriculumTitle: string
  description: string | undefined
  teacher: {
    fullName: string
    imageUrl: string | undefined
  }
  stats: {
    totalClasses: number
    completedClasses: number
    attendedClasses: number
    progressPercentage: number
  }
  nextSession: number | undefined
}

interface StudentClassCardProps {
  stat: ClassStat
  currentDateLocale: Locale
}

export function StudentClassCard({ stat, currentDateLocale }: StudentClassCardProps) {
  const t = useTranslations()

  // Derive explicit performance stats
  const missedClasses = stat.stats.completedClasses - stat.stats.attendedClasses
  const remainingClasses = stat.stats.totalClasses - stat.stats.completedClasses

  return (
    <Card 
      className="group overflow-hidden border-2 border-b-4 border-gray-200 dark:border-gray-800 hover:border-purple-400 dark:hover:border-purple-600 hover:translate-y-[-2px] transition-all duration-200 bg-white dark:bg-gray-900/90 backdrop-blur-sm rounded-2xl"
    >
      {/* Header with gamified solid color accent */}
      <div className="h-3 w-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500" />
      
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 p-4 sm:p-5">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">
            {stat.curriculumTitle}
          </p>
          
          <CardTitle className="text-lg sm:text-xl font-black line-clamp-1 text-gray-900 dark:text-gray-100 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
            {stat.className}
          </CardTitle>

          <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-1 line-clamp-1">
            {stat.description || t('common.noDescription')}
          </p>
        </div>
        
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center ml-2 border-2 border-b-4 border-purple-200 dark:border-purple-800 shrink-0 transform rotate-3">
          <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5 pt-0">
        {/* Gamified Stat Pills */}
        <div className="grid grid-cols-3 gap-2">
          {/* Attended */}
          <div className="flex flex-col items-center justify-center bg-green-50 dark:bg-green-950/30 rounded-xl p-2 border-2 border-b-4 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4 mb-1" />
            <span className="text-lg font-black leading-none">{stat.stats.attendedClasses}</span>
            <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('student.attended') || 'Attended'}</span>
          </div>

          {/* Missed */}
          <div className="flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/30 rounded-xl p-2 border-2 border-b-4 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400">
            <XCircle className="w-4 h-4 mb-1" />
            <span className="text-lg font-black leading-none">{missedClasses}</span>
            <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('student.missed') || 'Missed'}</span>
          </div>

          {/* Remaining */}
          <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/50 rounded-xl p-2 border-2 border-b-4 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
            <Calendar className="w-4 h-4 mb-1" />
            <span className="text-lg font-black leading-none">{remainingClasses}</span>
            <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('student.remaining') || 'Left'}</span>
          </div>
        </div>

        {/* Level / Progress Ring Equivalent (Horizontal Gamified Bar) */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-end">
            <span className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">
              Class Mastery
            </span>
            <span className="font-black text-purple-600 dark:text-purple-400 text-sm sm:text-base">
              {stat.stats.progressPercentage}%
            </span>
          </div>
          <div className="h-3 sm:h-4 w-full bg-gray-100 dark:bg-gray-800 rounded-full p-0.5 border-2 border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-400 to-pink-500 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${stat.stats.progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Footer Area: Teacher & Next Class */}
        <div className="flex items-center justify-between pt-4 border-t-2 border-dashed border-gray-100 dark:border-gray-800 gap-2">
          {/* Teacher Profile */}
          <div className="flex items-center gap-2 min-w-0">
            {stat.teacher.imageUrl ? (
              <Image 
                src={stat.teacher.imageUrl} 
                alt={stat.teacher.fullName} 
                width={32} 
                height={32} 
                className="w-8 h-8 rounded-full object-cover border-2 border-purple-200 dark:border-purple-900 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 font-bold border-2 border-purple-200 dark:border-purple-800 text-xs shrink-0">
                  {stat.teacher.fullName.charAt(0)}
              </div>
            )}
            <div className="truncate">
              <p className="font-bold text-xs sm:text-sm text-gray-700 dark:text-gray-200 truncate">{stat.teacher.fullName}</p>
            </div>
          </div>

          {/* Next Session Bubble */}
          {stat.nextSession && (
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg border-2 border-b-4 border-blue-200 dark:border-blue-800 shrink-0">
              <CalendarClock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] sm:text-xs font-bold text-blue-700 dark:text-blue-300 capitalize whitespace-nowrap">
                {format(stat.nextSession, "MMM d, h:mm a", { locale: currentDateLocale })}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}