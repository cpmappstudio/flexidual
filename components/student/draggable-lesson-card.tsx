"use client"

import { motion } from "framer-motion"
import { format } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
// Add MonitorPlay
import { Clock, Calendar, GripVertical, Sparkles, MonitorPlay, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTranslations, useLocale } from "next-intl"
import { StudentScheduleEvent } from "@/lib/types/student"

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
  const isIgnitia = lesson.sessionType === "ignitia";

  const getCardStyle = () => {
    if (isPast) return 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700 opacity-60';
    
    if (lesson.isLive) {
      if (isIgnitia) {
        return 'bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-950 dark:to-amber-950 border-orange-400 dark:border-orange-600 shadow-lg shadow-orange-200 dark:shadow-orange-900/30';
      }
      return 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-950 dark:to-emerald-950 border-green-400 dark:border-green-600 shadow-lg shadow-green-200 dark:shadow-green-900/30';
    }

    if (isIgnitia) {
        return 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-orange-300 dark:border-orange-700 shadow-lg hover:shadow-xl';
    }
    return 'bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-950 dark:to-purple-950 border-blue-400 dark:border-purple-600 shadow-lg hover:shadow-xl';
  }

  return (
    <motion.div
      draggable={!isPast}
      onDragStart={() => onDragStart(lesson)}
      onDragEnd={onDragEnd}
      whileHover={!isPast ? { scale: 1.02, y: -2 } : {}}
      whileTap={!isPast ? { scale: 0.98 } : {}}
      className={`relative rounded-2xl border-4 p-4 transition-all cursor-grab active:cursor-grabbing ${getCardStyle()}`}
      style={{ borderColor: !isPast && !isIgnitia && !lesson.isLive ? lesson.color : undefined }}
    >
      {/* Drag Handle */}
      {!isPast && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-full p-1 shadow-md border-2 border-gray-300 dark:border-gray-600">
          <GripVertical className="w-5 h-5 text-gray-400" />
        </div>
      )}

      {/* Live / Active Badge */}
      {lesson.isLive && (
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="absolute -top-3 -right-3"
        >
          {isIgnitia ? (
             <Badge className="bg-orange-500 text-white font-bold px-3 py-1 shadow-lg">
                ● Active
             </Badge>
          ) : (
             <Badge className="bg-red-500 text-white font-bold px-3 py-1 shadow-lg">
                ● {tCommon('live')}
             </Badge>
          )}
        </motion.div>
      )}

      {/* Past Badge */}
      {isPast && (
        <Badge 
          className={`absolute -top-3 -right-3 ${
            isAttended ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'
          }`}
        >
          {isAttended ? `✓ ${t('attended')}` : `⚠ ${t('missed')}`}
        </Badge>
      )}

      {/* Sparkles for upcoming */}
      {!isPast && !lesson.isLive && (
        <Sparkles className={`absolute top-2 right-2 w-5 h-5 animate-pulse ${isIgnitia ? "text-orange-400" : "text-yellow-500"}`} />
      )}

      <div className="flex items-start gap-3">
        {/* Time Circle */}
        <div className={`flex-shrink-0 w-16 h-16 rounded-full bg-white dark:bg-gray-800 border-4 flex flex-col items-center justify-center shadow-md ${isIgnitia ? "border-orange-200" : ""}`}
          style={{ borderColor: !isIgnitia ? lesson.color : undefined }}
        >
          <span className="text-xs font-bold text-gray-500">
            {format(lesson.start, "MMM", { locale: dateLocale })}
          </span>
          <span className="text-2xl font-black">{format(lesson.start, "d")}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
             <h3 className="text-lg font-black truncate">
                {lesson.title}
             </h3>
             {/* Session Type Icon Badge */}
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
            <div className="flex items-center gap-1 bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded-full">
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

      {/* Drag Hint */}
      {!isPast && (
        <div className="mt-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 animate-bounce">
          👆 {t('dragHint')}
        </div>
      )}
    </motion.div>
  )
}