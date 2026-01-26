"use client"

import { motion } from "framer-motion"
import { format } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { Clock, Calendar, GripVertical, Sparkles, MonitorPlay, Video, AlertCircle, Timer, RotateCcw, CheckCircle2 } from "lucide-react"
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
  isAttended?: boolean
}

export function DraggableLessonCard({ 
  lesson, 
  onDragStart, 
  onDragEnd,
  isPast = false,
  isAttended = false 
}: DraggableLessonCardProps) {
  const t = useTranslations('student')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const dateLocale = locale === 'es' ? es : locale === 'pt-BR' ? ptBR : enUS
  
  const [now, setNow] = useState(Date.now())
  const [timeLeft, setTimeLeft] = useState(lesson.start - now)

  // Determine Type
  const isIgnitia = lesson.sessionType === "ignitia"
  
  // Update Timer
  useEffect(() => {
    // Ignitia lessons don't need a countdown if they are past/available
    if (isPast && !isIgnitia) return; 

    const interval = setInterval(() => {
      const currentNow = Date.now()
      setNow(currentNow)
      setTimeLeft(lesson.start - currentNow)
    }, 1000)

    return () => clearInterval(interval)
  }, [lesson.start, isPast, isIgnitia])

  // --- Logic for Status ---
  
  // ✅ FIX: Ignitia is NEVER "Late". It is self-paced.
  const isLate = !isIgnitia && timeLeft <= 0 && !lesson.isLive
  
  const isUrgent = timeLeft > 0 && timeLeft <= 5 * 60 * 1000 
  
  // ✅ FIX: Ignitia is always draggable/accessible, even in history
  const canDrag = !isPast || isIgnitia;

  // Formatter for countdown
  const formatCountdown = (ms: number) => {
    const absMs = Math.abs(ms)
    const minutes = Math.floor(absMs / 60000)
    const seconds = Math.floor((absMs % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // --- Dynamic Styles ---
  const getCardStyle = () => {
    // 🔴 LATE STATE (Live classes only)
    if (isLate) {
        return 'bg-red-50 dark:bg-red-950/20 border-red-500 dark:border-red-600 shadow-xl shadow-red-200 dark:shadow-red-900/20 ring-2 ring-red-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900';
    }

    // 🟠 IGNITIA STATE (Always active visuals, even in history)
    if (isIgnitia) {
        // If it's officially "past" but Ignitia, we still show it as accessible
        if (isPast) {
             return 'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-300 dark:border-orange-700 opacity-90 hover:opacity-100';
        }
        // Active/Upcoming Ignitia
        if (lesson.isLive || timeLeft <= 0) {
            return 'bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-950 dark:to-amber-950 border-orange-400 dark:border-orange-600 shadow-lg shadow-orange-200 dark:shadow-orange-900/30';
        }
        // Future Ignitia
        return 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-orange-300 dark:border-orange-700 shadow-lg hover:shadow-xl';
    }

    // ⚪ PAST STATE (Standard Live Classes)
    if (isPast) return 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700 opacity-60';

    // 🟡 URGENT STATE (5 min warning)
    if (isUrgent) {
        return 'bg-amber-50 dark:bg-amber-950/20 border-amber-500 dark:border-amber-500 shadow-lg shadow-amber-200 dark:shadow-amber-900/20';
    }
    
    // 🟢 ACTIVE/LIVE (Standard)
    if (lesson.isLive) {
      return 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-950 dark:to-emerald-950 border-green-400 dark:border-green-600 shadow-lg shadow-green-200 dark:shadow-green-900/30';
    }

    // 🔵 STANDARD FUTURE
    return 'bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-950 dark:to-purple-950 border-blue-400 dark:border-purple-600 shadow-lg hover:shadow-xl';
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
      style={{ borderColor: !isPast && !isIgnitia && !lesson.isLive && !isLate && !isUrgent ? lesson.color : undefined }}
    >
      {/* Drag Handle - Show if draggable */}
      {canDrag && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-full p-1 shadow-md border-2 border-gray-300 dark:border-gray-600 z-20">
          <GripVertical className="w-5 h-5 text-gray-400" />
        </div>
      )}

      {/* --- BADGES --- */}

      {/* 1. Live/Active Badge */}
      {(lesson.isLive || (isIgnitia && timeLeft <= 0 && !isPast)) && (
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="absolute -top-3 -right-3 z-10"
        >
          {isIgnitia ? (
             <Badge className="bg-orange-500 text-white font-bold px-3 py-1 shadow-lg">● Active</Badge>
          ) : (
             <Badge className="bg-red-500 text-white font-bold px-3 py-1 shadow-lg">● {tCommon('live')}</Badge>
          )}
        </motion.div>
      )}

      {/* 2. Urgent / Late Countdown Badge */}
      {!isPast && !lesson.isLive && (isUrgent || isLate) && (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -top-3 right-8 z-10"
        >
            <Badge className={cn(
                "font-mono font-bold shadow-sm border-2",
                isLate 
                    ? "bg-red-100 text-red-700 border-red-300 animate-pulse" 
                    : "bg-yellow-100 text-yellow-800 border-yellow-300"
            )}>
                {isLate ? (
                    <span className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Late: -{formatCountdown(timeLeft)}
                    </span>
                ) : (
                    <span className="flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        Starts in {formatCountdown(timeLeft)}
                    </span>
                )}
            </Badge>
        </motion.div>
      )}

      {/* 3. Past Badge / Ignitia History Badge */}
      {isPast && (
        <Badge 
          className={cn(
            "absolute -top-3 -right-3 z-10",
            isIgnitia 
                ? "bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200" 
                : (isAttended ? 'bg-green-500 text-white' : 'bg-gray-500 text-white')
          )}
        >
          {isIgnitia ? (
            <span className="flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                {t('pending')}
            </span>
          ) : (
            isAttended ? `✓ ${t('attended')}` : `⚠ ${t('missed')}`
          )}
        </Badge>
      )}

      {/* --- SPARKLES LOGIC (Show for Ignitia even if past, to indicate 'magical/active') --- */}
      {(canDrag && !lesson.isLive) && (
        <motion.div
            className="absolute top-2 right-2 z-0"
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
                "w-6 h-6",
                isLate ? "text-red-500" : (isIgnitia ? "text-orange-300" : "text-yellow-400")
            )} />
        </motion.div>
      )}

      <div className="flex items-start gap-3">
        {/* Time Circle */}
        <div className={cn(
            "flex-shrink-0 w-16 h-16 rounded-full bg-white dark:bg-gray-800 border-4 flex flex-col items-center justify-center shadow-md",
            isLate ? "border-red-200" : (isIgnitia ? "border-orange-200" : "")
        )}
          style={{ borderColor: (!isIgnitia && !isLate && !isUrgent) ? lesson.color : undefined }}
        >
          <span className="text-xs font-bold text-gray-500">
            {format(lesson.start, "MMM", { locale: dateLocale })}
          </span>
          <span className={cn(
            "text-2xl font-black",
            isLate ? "text-red-500" : ""
          )}>
            {format(lesson.start, "d")}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
             <h3 className="text-lg font-black truncate">
                {lesson.title}
             </h3>
             {/* Type Icons */}
             {isIgnitia && (
                <div className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-100 p-1 rounded-md" title="Ignitia Lesson">
                    <MonitorPlay className="w-4 h-4" />
                </div>
             )}
             {!isIgnitia && !isPast && (
                <div className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100 p-1 rounded-md" title="Live Class">
                    <Video className="w-4 h-4" />
                </div>
             )}
          </div>

          <p className="text-sm font-bold text-gray-600 dark:text-gray-400 truncate mb-2">
            📚 {lesson.className}
          </p>
          
          <div className="flex flex-wrap gap-2 text-xs">
            <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full",
                isLate 
                    ? "bg-red-100 text-red-700 font-bold" 
                    : "bg-white/80 dark:bg-gray-800/80"
            )}>
              <Clock className="w-3 h-3" />
              <span className="font-bold">
                {format(lesson.start, "h:mm a", { locale: dateLocale })}
              </span>
            </div>
            {isIgnitia && (
               <div className="flex items-center gap-1 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-200 px-2 py-1 rounded-full font-bold">
                   Ignitia
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Drag Hint - Show for all Ignitia (even past) and future Live */}
      {canDrag && (
        <div className={cn(
            "mt-3 text-center text-xs font-bold animate-bounce",
            isLate ? "text-red-500" : "text-gray-500 dark:text-gray-400"
        )}>
          👆 {t('dragHint')}
        </div>
      )}
    </motion.div>
  )
}