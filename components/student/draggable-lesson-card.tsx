"use client"

import { motion } from "framer-motion"
import { format } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { Clock, GripVertical, MonitorPlay, Video, AlertCircle, RotateCcw, Radio, Hourglass } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTranslations, useLocale } from "next-intl"
import { StudentScheduleEvent } from "@/lib/types/student"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface DraggableLessonCardProps {
  lesson: StudentScheduleEvent
  onDragStart: (lesson: StudentScheduleEvent) => void
  onDragEnd: () => void
  isPast?: boolean
}

export function DraggableLessonCard({ 
  lesson, 
  onDragStart, 
  onDragEnd,
  isPast = false
}: DraggableLessonCardProps) {
  const t = useTranslations('student')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const dateLocale = locale === 'es' ? es : locale === 'pt-BR' ? ptBR : enUS
  
  const [now, setNow] = useState(Date.now())

  // Calculate durations
  const durationMs = lesson.end - lesson.start;
  const timeToStart = lesson.start - now;
  const timeToEnd = lesson.end - now;
  
  // 50% Threshold logic
  const requiredTimeMs = durationMs * 0.5;
  const canStillPass = timeToEnd >= requiredTimeMs;

  const isIgnitia = lesson.sessionType === "ignitia"
  
  // Update timer
  useEffect(() => {
    // If the class is completely over and recorded, stop the timer to save resources
    if (now > lesson.end + 1000 && !isIgnitia && !lesson.isStudentActive) return; 

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [lesson.end, isIgnitia, lesson.isStudentActive, now])

  // --- 🧠 REFINED STATE LOGIC ---

  // 1. "In Class": Backend says student is currently in the session
  const isInClass = lesson.isStudentActive;

  // 2. "Completed States":
  const isPresent = lesson.attendance === "present";
  // "Partial" is only a final state if the class is OVER. 
  // If class is running, "Partial" just means "accumulating time".
  const isPartialFinal = lesson.attendance === "partial" && now > lesson.end; 

  // 3. "Live": The class window is open right now
  const isLiveWindow = now >= lesson.start && now < lesson.end;

  // 4. "Late": 
  // - Class has started (now > start)
  // - Class has NOT ended (now < end)
  // - Not in class
  // - Not already marked present
  const isLate = !isIgnitia && isLiveWindow && !isInClass && !isPresent;
  
  // 5. "Missed" (Historic):
  // - Class time is over
  // - Not present, not partial final, not currently active
  const isMissed = !isIgnitia && now >= lesson.end && !isPresent && !isPartialFinal && !isInClass;

  // 6. "Urgent": 5 min warning before start
  const isUrgent = timeToStart > 0 && timeToStart <= 5 * 60 * 1000;

  // 7. "Draggable":
  // - Future/Live classes
  // - Ignitia (Always)
  // - Active/InClass (to rejoin)
  // - Late classes (to try and get partial credit)
  // - BLOCKED: Truly missed past classes
  const canDrag = isIgnitia || isInClass || isLiveWindow || (now < lesson.start);

  // Formatter for countdown
  const formatCountdown = (ms: number) => {
    const absMs = Math.abs(ms)
    const minutes = Math.floor(absMs / 60000)
    const seconds = Math.floor((absMs % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // --- Dynamic Styles ---
  const getCardStyle = () => {
    // 🔵 ACTIVE / IN CLASS (Highest Priority)
    if (isInClass) {
        return 'bg-green-50 border-green-500 ring-2 ring-green-400 ring-offset-2 animate-pulse-slow';
    }

    // 🔴 LATE STATE (Active Window Only)
    if (isLate) {
        // If they can't pass anymore, make it look more severe/desaturated
        if (!canStillPass) {
            return 'bg-red-50/50 border-red-300 dark:border-red-800 border-dashed';
        }
        return 'bg-red-50 dark:bg-red-950/20 border-red-500 dark:border-red-600 shadow-xl shadow-red-200 dark:shadow-red-900/20';
    }

    // 🟠 IGNITIA STATE
    if (isIgnitia) {
        if (lesson.isLive || (now >= lesson.start && now <= lesson.end)) {
            return 'bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-950 dark:to-amber-950 border-orange-400';
        }
        return 'bg-gradient-to-r from-amber-50 to-orange-50 border-orange-300 shadow-lg';
    }

    // ⚫ MISSED / PAST STATE
    if (isMissed) return 'bg-gray-100 dark:bg-gray-900 border-gray-300 opacity-60 grayscale';

    // 🟢 COMPLETED STATE
    if (isPresent || isPartialFinal) return 'bg-white dark:bg-gray-800 border-green-200 opacity-80';

    // 🟡 URGENT STATE
    if (isUrgent) {
        return 'bg-amber-50 border-amber-500 shadow-lg shadow-amber-200';
    }
    
    // 🟢 TEACHER IS LIVE (But maybe current user isn't in yet)
    if (lesson.isLive) {
      return 'bg-gradient-to-r from-green-100 to-emerald-100 border-green-400 shadow-lg';
    }

    // 🔵 STANDARD FUTURE
    return 'bg-gradient-to-r from-blue-100 to-purple-100 border-blue-400 shadow-lg';
  }

  return (
    <motion.div
      draggable={canDrag}
      onDragStart={() => canDrag && onDragStart(lesson)}
      onDragEnd={onDragEnd}
      whileHover={canDrag ? { scale: 1.02, y: -2 } : {}}
      whileTap={canDrag ? { scale: 0.98 } : {}}
      className={cn(
        "relative rounded-2xl border-4 p-4 transition-all",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        getCardStyle()
      )}
      style={{ borderColor: !isMissed && !isIgnitia && !lesson.isLive && !isLate && !isUrgent && !isInClass ? lesson.color : undefined }}
    >
      {canDrag && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-full p-1 shadow-md border-2 border-gray-300 dark:border-gray-600 z-20">
          <GripVertical className="w-5 h-5 text-gray-400" />
        </div>
      )}

      {/* --- BADGES --- */}

      {/* 1. Student In Class Badge */}
      {isInClass && (
        <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute -top-3 left-8 z-10"
        >
            <Badge className="bg-green-600 text-white font-bold border-2 border-white shadow-md animate-pulse">
                <Radio className="w-3 h-3 mr-1" />
                In Class
            </Badge>
        </motion.div>
      )}

      {/* 2. Urgent / Late Badge */}
      {isLate && (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -top-3 right-8 z-10"
        >
            {canStillPass ? (
                <Badge className="bg-red-100 text-red-700 border-red-300 animate-pulse font-mono font-bold shadow-sm border-2">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Late: -{formatCountdown(now - lesson.start)}
                </Badge>
            ) : (
                <Badge className="bg-orange-100 text-orange-700 border-orange-300 font-bold shadow-sm border-2">
                    <Hourglass className="w-3 h-3 mr-1" />
                    Partial Credit Only
                </Badge>
            )}
        </motion.div>
      )}

      {/* 3. Past / Attendance / Missed Badge */}
      {(isMissed || isPresent || isPartialFinal) && !isInClass && (
        <Badge 
          className={cn(
            "absolute -top-3 -right-3 z-10",
            isIgnitia ? "bg-orange-100 text-orange-700 border-orange-300" 
            : isPresent ? 'bg-green-500 text-white' 
            : isPartialFinal ? 'bg-yellow-500 text-white'
            : 'bg-gray-500 text-white'
          )}
        >
          {isIgnitia ? (
            <span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Review</span>
          ) : isPresent ? (
            `✓ ${t('attended')}`
          ) : isPartialFinal ? (
            `~ Partial`
          ) : (
            `⚠ ${t('missed')}`
          )}
        </Badge>
      )}

      {/* Time Circle */}
      <div className="flex items-start gap-3">
        <div className={cn(
            "flex-shrink-0 w-16 h-16 rounded-full bg-white dark:bg-gray-800 border-4 flex flex-col items-center justify-center shadow-md",
            isLate ? "border-red-200" : (isIgnitia ? "border-orange-200" : ""),
            isMissed ? "grayscale opacity-50" : ""
        )}
          style={{ borderColor: (!isMissed && !isIgnitia && !isLate && !isUrgent && !isInClass) ? lesson.color : undefined }}
        >
          <span className="text-xs font-bold text-gray-500">
            {format(lesson.start, "MMM", { locale: dateLocale })}
          </span>
          <span className={cn("text-2xl font-black", isLate ? "text-red-500" : "")}>
            {format(lesson.start, "d")}
          </span>
        </div>

        {/* Content */}
        <div className={cn("flex-1 min-w-0", isMissed && "opacity-60")}>
          <div className="flex items-center gap-2 mb-1">
             <h3 className="text-lg font-black truncate">{lesson.title}</h3>
             {isIgnitia && (
                <div className="bg-orange-100 text-orange-700 p-1 rounded-md">
                    <MonitorPlay className="w-4 h-4" />
                </div>
             )}
             {!isIgnitia && !isMissed && (
                <div className="bg-blue-100 text-blue-700 p-1 rounded-md">
                    <Video className="w-4 h-4" />
                </div>
             )}
          </div>
          <p className="text-sm font-bold text-gray-600 dark:text-gray-400 truncate mb-2">
            📚 {lesson.className}
          </p>
          
          {/* Metadata Badges */}
          <div className="flex flex-wrap gap-2 text-xs">
            <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full",
                isLate ? "bg-red-100 text-red-700 font-bold" : "bg-white/80 dark:bg-gray-800/80"
            )}>
              <Clock className="w-3 h-3" />
              <span className="font-bold">
                {format(lesson.start, "h:mm a", { locale: dateLocale })} - {format(lesson.end, "h:mm a", { locale: dateLocale })}
              </span>
            </div>
            
            {/* Show duration if attended or partial */}
            {(lesson.minutesAttended > 0) && (
                <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">
                    <Clock className="w-3 h-3" />
                    {lesson.minutesAttended}m
                </div>
            )}
          </div>
        </div>
      </div>

      {canDrag && (
        <div className={cn(
            "mt-3 text-center text-xs font-bold animate-bounce",
            isLate ? "text-red-500" : "text-gray-500 dark:text-gray-400"
        )}>
          👆 {isInClass ? "Rejoin Session" : t('dragHint')}
        </div>
      )}
    </motion.div>
  )
}