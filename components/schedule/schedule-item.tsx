"use client"

import { format } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { CheckCircle2, MonitorPlay, Video, BookOpen, ArrowRight } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import Link from "next/link"
import { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ManageScheduleDialog } from "@/components/teaching/classes/manage-schedule-dialog"

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const

interface ScheduleItemProps {
  schedule: {
    scheduleId: Id<"classSchedule">
    lessonId?: Id<"lessons">
    classId: Id<"classes">
    title: string
    description?: string
    start: number | Date
    end: number | Date
    roomName: string
    sessionType?: "live" | "ignitia"
    isLive?: boolean
    status?: "scheduled" | "active" | "cancelled" | "completed"
    className?: string
    curriculumTitle?: string
  }
  classId?: Id<"classes">
  isPast?: boolean
  showDate?: boolean
  showEdit?: boolean
  showDescription?: boolean
  onEventClick?: () => void
}

export function ScheduleItem({ 
  schedule, 
  classId, 
  isPast = false,
  showDate = true,
  showEdit = true,
  showDescription = true,
  onEventClick
}: ScheduleItemProps) {
  const t = useTranslations()
  const locale = useLocale()
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS
  const isIgnitia = schedule.sessionType === "ignitia"
  
  // Convert to Date if needed
  const startDate = schedule.start instanceof Date ? schedule.start : new Date(schedule.start)
  const endDate = schedule.end instanceof Date ? schedule.end : new Date(schedule.end)
  
  const handleClick = () => {
    if (onEventClick) {
      onEventClick()
    }
  }
  
  return (
    <div 
      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4 ${isPast ? 'opacity-60' : ''} ${isIgnitia ? 'bg-orange-50/30 border-orange-100' : ''} ${onEventClick ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-4 flex-1">
        {/* Date Badge */}
        {showDate && (
          <div className={`flex flex-col items-center justify-center min-w-[60px] text-center p-2 rounded-md ${
            isIgnitia ? "bg-orange-100 text-orange-900" : "bg-muted"
          }`}>
            <span className="text-xs font-bold uppercase opacity-70">
              {format(startDate, "MMM", { locale: dateLocale })}
            </span>
            <span className="text-xl font-bold">
              {format(startDate, "d", { locale: dateLocale })}
            </span>
            <span className="text-xs opacity-70">
              {format(startDate, "h:mm a", { locale: dateLocale })}
            </span>
          </div>
        )}

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col gap-0.5">
              {schedule.className && (
                <h4 className="font-semibold text-base">{schedule.className}</h4>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={schedule.className ? "text-sm text-muted-foreground" : "font-medium"}>
                  {schedule.title}
                </span>
                {schedule.curriculumTitle && (
                  <span className="text-xs text-muted-foreground">
                    • {schedule.curriculumTitle}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {/* Session Type Badge */}
            {isIgnitia ? (
              <Badge variant="outline" className="shrink-0 text-orange-700 bg-orange-100 border-orange-200">
                <MonitorPlay className="h-3 w-3 mr-1" />
                Ignitia
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">
                <Video className="h-3 w-3 mr-1" />
                {t('schedule.typeLive')}
              </Badge>
            )}

            {schedule.lessonId && (
              <Badge variant="outline" className="shrink-0">
                <BookOpen className="h-3 w-3 mr-1" />
                {t('lesson.linked')}
              </Badge>
            )}
            
            {/* Active Status */}
            {schedule.isLive && (
              isIgnitia ? (
                <Badge className="shrink-0 bg-orange-500">Active</Badge>
              ) : (
                <Badge variant="destructive" className="animate-pulse shrink-0">
                  {t('common.live')}
                </Badge>
              )
            )}
            
            {schedule.status === "cancelled" && (
              <Badge variant="secondary" className="shrink-0">
                {t('schedule.cancelled')}
              </Badge>
            )}
            {schedule.status === "completed" && (
              <Badge variant="secondary" className="shrink-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t('dashboard.completed')}
              </Badge>
            )}
          </div>
          
          {showDescription && schedule.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1.5">
              {schedule.description}
            </p>
          )}
          
          <p className="text-xs text-muted-foreground mt-1.5">
            {format(startDate, "h:mm a", { locale: dateLocale })} - {format(endDate, "h:mm a", { locale: dateLocale })}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {!isPast && schedule.status !== "cancelled" && (
          <>
            {/* Edit Button - only show if classId is provided and showEdit is true */}
            {classId && showEdit && (
              <ManageScheduleDialog 
                classId={classId}
                scheduleId={schedule.scheduleId}
                initialData={{
                  lessonId: schedule.lessonId, 
                  title: schedule.title,
                  description: schedule.description,
                  start: startDate.getTime(),
                  end: endDate.getTime(),
                  sessionType: schedule.sessionType || "live"
                }}
                trigger={<Button size="sm" variant="outline">{t('common.edit')}</Button>}
              />
            )}
            
            {/* Session Button */}
            {schedule.isLive ? (
              <Button 
                size="sm" 
                variant={isIgnitia ? "default" : "destructive"} 
                className={isIgnitia ? "bg-orange-600 hover:bg-orange-700" : ""}
                asChild
              >
                <Link href={`/classroom/${schedule.roomName}`}>
                  {isIgnitia ? "Open Session" : t('classroom.joinLive')}
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/classroom/${schedule.roomName}`}>
                  {isIgnitia ? (
                    <>
                      <MonitorPlay className="mr-2 h-4 w-4 text-orange-600" />
                      Open Ignitia
                    </>
                  ) : (
                    <>
                      {t('classroom.prepareRoom')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}