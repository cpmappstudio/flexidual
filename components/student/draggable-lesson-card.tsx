"use client"

import { motion } from "framer-motion"
import { format } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { Clock, GripVertical, MonitorPlay, Video, AlertCircle, RotateCcw, Radio, Hourglass, Sparkles } from "lucide-react"
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
    if (now > lesson.end + 1000 && !isIgnitia && !lesson.isStudentActive) return; 

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [lesson.end, isIgnitia, lesson.isStudentActive, now])

  // --- 🧠 STATE LOGIC ---
  const isInClass = lesson.isStudentActive;
  const isPresent = lesson.attendance === "present";
  const isPartialFinal = lesson.attendance === "partial" && now > lesson.end; 
  const isLiveWindow = now >= lesson.start && now < lesson.end;
  const isLate = !isIgnitia && isLiveWindow && !isInClass && !isPresent;
  const isMissed = !isIgnitia && now >= lesson.end && !isPresent && !isPartialFinal && !isInClass;
  const isUrgent = timeToStart > 0 && timeToStart <= 5 * 60 * 1000;
  const canDrag = isIgnitia || isInClass || isLiveWindow || (now < lesson.start);

  const formatCountdown = (ms: number) => {
    const absMs = Math.abs(ms)
    const minutes = Math.floor(absMs / 60000)
    const seconds = Math.floor((absMs % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // --- 🎨 VISUAL STYLES ---
  const getCardStyle = () => {
    // 🔵 ACTIVE / IN CLASS
    if (isInClass) {
        return 'bg-green-50 dark:bg-green-950/50 border-green-500 ring-2 ring-green-400 ring-offset-2 dark:ring-offset-gray-900 animate-pulse-slow';
    }

    // 🔴 LATE STATE
    if (isLate) {
        if (!canStillPass) {
            return 'bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-900 border-dashed';
        }
        return 'bg-red-50 dark:bg-red-950/40 border-red-500 dark:border-red-700 shadow-xl shadow-red-200 dark:shadow-none';
    }

    // 🟠 IGNITIA STATE (Refined Gradients)
    if (isIgnitia) {
        if (lesson.isLive || (now >= lesson.start && now <= lesson.end)) {
            // Live/Active Ignitia -> Vibrant Orange Gradient
            return 'bg-gradient-to-br from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 border-orange-400 dark:border-orange-500';
        }
        // Scheduled Ignitia -> Warm Subtle Gradient
        return 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-orange-300 dark:border-orange-800 shadow-lg';
    }

    // ⚫ MISSED
    if (isMissed) {
        return 'bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800 opacity-60 grayscale';
    }

    // 🟢 COMPLETED
    if (isPresent || isPartialFinal) {
        return 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-900 opacity-80';
    }

    // 🟡 URGENT
    if (isUrgent) {
        return 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 shadow-lg shadow-amber-200 dark:shadow-none';
    }
    
    // 🟢 TEACHER LIVE
    if (lesson.isLive) {
      return 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-950 dark:to-emerald-950 border-green-400 dark:border-green-600 shadow-lg';
    }

    // 🔵 STANDARD FUTURE
    return 'bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-950 dark:to-purple-950 border-blue-400 dark:border-purple-500 shadow-lg hover:shadow-xl transition-shadow';
  }

  // --- TEXT COLORS ---
  const getTextColor = () => {
      if (isMissed) return "text-gray-500 dark:text-gray-500";
      if (isLate) return "text-gray-800 dark:text-red-100";
      if (isIgnitia) return "text-gray-800 dark:text-orange-100";
      return "text-gray-800 dark:text-gray-100";
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
      
      {/* --- ✨ SPARKLES LOGIC ✨ --- */}
      {(canDrag && !lesson.isLive) && (
        <motion.div
            className="absolute top-2 right-2 z-0 pointer-events-none"
            animate={
                isLate 
                    ? { scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] } 
                    : isUrgent 
                        ? { scale: [1, 1.3, 1], rotate: [0, 15, -15, 0] } 
                        : { opacity: [0.4, 1, 0.4] }
            }
            transition={{
                duration: isLate ? 0.5 : isUrgent ? 1 : 2, 
                repeat: Infinity,
                ease: "easeInOut"
            }}
        >
            <Sparkles className={cn(
                "w-6 h-6 opacity-80",
                isLate ? "text-red-500" : (isIgnitia ? "text-orange-400 dark:text-orange-300" : "text-yellow-400")
            )} />
        </motion.div>
      )}

      {canDrag && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-full p-1 shadow-md border-2 border-gray-300 dark:border-gray-600 z-20">
          <GripVertical className="w-5 h-5 text-gray-400" />
        </div>
      )}

      {/* --- BADGES --- */}
      {isInClass && (
        <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute -top-3 left-8 z-10"
        >
            <Badge className="bg-green-600 text-white font-bold border-2 border-white dark:border-gray-800 shadow-md animate-pulse">
                <Radio className="w-3 h-3 mr-1" />
                In Class
            </Badge>
        </motion.div>
      )}

      {isLate && (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -top-3 right-8 z-10"
        >
            {canStillPass ? (
                <Badge className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 border-red-300 dark:border-red-700 animate-pulse font-mono font-bold shadow-sm border-2">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Late: -{formatCountdown(now - lesson.start)}
                </Badge>
            ) : (
                <Badge className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-100 border-orange-300 dark:border-orange-700 font-bold shadow-sm border-2">
                    <Hourglass className="w-3 h-3 mr-1" />
                    Partial Credit Only
                </Badge>
            )}
        </motion.div>
      )}

      {(isMissed || isPresent || isPartialFinal) && !isInClass && (
        <Badge 
          className={cn(
            "absolute -top-3 -right-3 z-10 border-2",
            isIgnitia 
                ? "bg-orange-100 dark:bg-orange-900/80 text-orange-700 dark:text-orange-100 border-orange-300 dark:border-orange-700" 
            : isPresent 
                ? 'bg-green-500 text-white border-green-600' 
            : isPartialFinal 
                ? 'bg-yellow-500 text-white border-yellow-600'
            : 'bg-gray-500 dark:bg-gray-700 text-white border-gray-600'
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
      <div className="flex items-start gap-3 relative z-10">
        <div className={cn(
            "flex-shrink-0 w-16 h-16 rounded-full bg-white dark:bg-gray-800 border-4 flex flex-col items-center justify-center shadow-md",
            isLate ? "border-red-200 dark:border-red-900" : (isIgnitia ? "border-orange-200 dark:border-orange-900" : ""),
            isMissed ? "grayscale opacity-50 dark:border-gray-700" : ""
        )}
          style={{ borderColor: (!isMissed && !isIgnitia && !isLate && !isUrgent && !isInClass) ? lesson.color : undefined }}
        >
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
            {format(lesson.start, "MMM", { locale: dateLocale })}
          </span>
          <span className={cn("text-2xl font-black text-gray-800 dark:text-gray-100", isLate ? "text-red-500 dark:text-red-400" : "")}>
            {format(lesson.start, "d")}
          </span>
        </div>

        {/* Content */}
        <div className={cn("flex-1 min-w-0", isMissed && "opacity-60")}>
          <div className="flex items-center gap-2 mb-1">
             <h3 className={cn("text-lg font-black truncate", getTextColor())}>{lesson.title}</h3>
             {isIgnitia && (
                <div className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200 p-1 rounded-md">
                    <MonitorPlay className="w-4 h-4" />
                </div>
             )}
             {!isIgnitia && !isMissed && (
                <div className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 p-1 rounded-md">
                    <Video className="w-4 h-4" />
                </div>
             )}
          </div>
          <p className="text-sm font-bold text-gray-600 dark:text-gray-300 truncate mb-2">
            📚 {lesson.className}
          </p>
          
          <div className="flex flex-wrap gap-2 text-xs">
            <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full",
                isLate 
                    ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 font-bold" 
                    : "bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300"
            )}>
              <Clock className="w-3 h-3" />
              <span className="font-bold">
                {format(lesson.start, "h:mm a", { locale: dateLocale })} - {format(lesson.end, "h:mm a", { locale: dateLocale })}
              </span>
            </div>
            
            {(lesson.minutesAttended > 0) && (
                <div className="flex items-center gap-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-1 rounded-full font-bold">
                    <Clock className="w-3 h-3" />
                    {lesson.minutesAttended}m
                </div>
            )}
          </div>
        </div>
      </div>

      {canDrag && (
        <div className={cn(
            "mt-3 text-center text-xs font-bold animate-bounce relative z-10",
            isLate ? "text-red-500 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
        )}>
          👆 {isInClass ? "Rejoin Session" : t('dragHint')}
        </div>
      )}
    </motion.div>
  )
}