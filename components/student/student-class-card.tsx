"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, CheckCircle2, XCircle, Calendar, CalendarClock, type LucideIcon } from "lucide-react"
import * as LucideIcons from "lucide-react"
import { format, Locale } from "date-fns"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Id } from "@/convex/_generated/dataModel"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"

type LucideIconKey = keyof typeof LucideIcons;

export interface ClassStat {
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
  icon?: string | null
}

interface StudentClassCardProps {
  stat: ClassStat
  currentDateLocale: Locale
}

export function StudentClassCard({ stat, currentDateLocale }: StudentClassCardProps) {
  const t = useTranslations()

  const updateIcon = useMutation(api.student.updateClassIcon)
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  // A curated list of fun, school-appropriate icons
  const AVAILABLE_ICONS: LucideIconKey[] = [
    "BookOpen", "Calculator", "Microscope", "Globe2",
    "Palette", "Music", "Laptop", "Rocket",
    "Star", "Atom", "Trophy", "Gamepad2"
  ]

  const IconComponent: LucideIcon = stat.icon && stat.icon in LucideIcons
    ? LucideIcons[stat.icon as LucideIconKey] as LucideIcon
    : BookOpen;

  // Derive explicit performance stats
  const missedClasses = stat.stats.completedClasses - stat.stats.attendedClasses
  const remainingClasses = stat.stats.totalClasses - stat.stats.completedClasses

  return (
    <Card
      className="group overflow-hidden border-2 border-b-4 border-border hover:border-primary hover:translate-y-[-2px] transition-all duration-200 bg-card backdrop-blur-sm rounded-2xl"
    >
      {/* Header with gamified solid color accent */}
      <div className="h-3 w-full bg-gradient-to-r from-primary via-primary to-secondary" />

      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 p-4 sm:p-5">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-bold text-primary uppercase tracking-wider mb-1">
            {stat.curriculumTitle}
          </p>

          <CardTitle className="text-lg sm:text-xl font-black line-clamp-1 text-card-foreground group-hover:text-primary transition-colors">
            {stat.className}
          </CardTitle>

          <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-1 line-clamp-1">
            {stat.description || t('common.noDescription')}
          </p>
        </div>

        <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
          <PopoverTrigger asChild title={t('student.chooseIconTitle') || 'Choose Icon'}>
            <button className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center ml-2 border-2 border-b-4 border-primary/20 shrink-0 transform hover:rotate-0 hover:scale-105 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
              <IconComponent className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 rounded-2xl border-2 border-primary/20 shadow-xl" align="end">
            <p className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wider text-center">
              {t('student.chooseIcon') || 'Choose Icon'}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {AVAILABLE_ICONS.map((iconName: LucideIconKey) => {
                 const GridIcon = LucideIcons[iconName] as LucideIcon;
                 const isSelected = stat.icon === iconName;
                 return (
                   <button
                     key={iconName}
                     onClick={() => {
                        updateIcon({ classId: stat.classId, icon: iconName });
                        setIsPickerOpen(false);
                     }}
                     className={`p-2 rounded-xl flex items-center justify-center border-2 transition-all hover:scale-110 ${
                       isSelected
                        ? 'bg-primary/10 border-primary text-primary'
                                                : 'bg-muted border-border text-muted-foreground hover:border-primary/30 hover:text-primary'
                     }`}
                   >
                     <GridIcon className="w-5 h-5" />
                   </button>
                 )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5 pt-0">
        {/* Gamified Stat Pills */}
        <div className="grid grid-cols-3 gap-2">
          {/* Attended */}
          <div className="flex flex-col items-center justify-center bg-success/10 rounded-xl p-2 border-2 border-b-4 border-success/30 text-success">
            <CheckCircle2 className="w-4 h-4 mb-1" />
            <span className="text-lg font-black leading-none">{stat.stats.attendedClasses}</span>
            <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('student.attended') || 'Attended'}</span>
          </div>

          {/* Missed */}
          <div className="flex flex-col items-center justify-center bg-destructive/10 rounded-xl p-2 border-2 border-b-4 border-destructive/30 text-destructive">
            <XCircle className="w-4 h-4 mb-1" />
            <span className="text-lg font-black leading-none">{missedClasses}</span>
            <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('student.missed') || 'Missed'}</span>
          </div>

          {/* Remaining */}
          <div className="flex flex-col items-center justify-center bg-muted rounded-xl p-2 border-2 border-b-4 border-border text-muted-foreground">
            <Calendar className="w-4 h-4 mb-1" />
            <span className="text-lg font-black leading-none">{remainingClasses}</span>
            <span className="text-[10px] sm:text-xs font-bold uppercase mt-1">{t('student.remaining') || 'Left'}</span>
          </div>
        </div>

        {/* Level / Progress Ring Equivalent (Horizontal Gamified Bar) */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-end">
            <span className="text-xs sm:text-sm font-bold text-foreground">
              {t('student.profile.classMastery')}
            </span>
            <span className="font-black text-primary text-sm sm:text-base">
              {stat.stats.progressPercentage}%
            </span>
          </div>
          <div className="h-3 sm:h-4 w-full bg-muted rounded-full p-0.5 border-2 border-border relative overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${stat.stats.progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Footer Area: Teacher & Next Class */}
        <div className="flex items-center justify-between pt-4 border-t-2 border-dashed border-border gap-2">
          {/* Teacher Profile */}
          <div className="flex items-center gap-2 min-w-0">
            {stat.teacher.imageUrl ? (
              <Image
                src={stat.teacher.imageUrl}
                alt={stat.teacher.fullName}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover border-2 border-primary/20 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold border-2 border-primary/20 text-xs shrink-0">
                  {stat.teacher.fullName.charAt(0)}
              </div>
            )}
            <div className="truncate">
              <p className="font-bold text-xs sm:text-sm text-foreground truncate">{stat.teacher.fullName}</p>
            </div>
          </div>

          {/* Next Session Bubble */}
          {stat.nextSession && (
            <div className="flex items-center gap-1.5 bg-info/10 px-2 py-1 rounded-lg border-2 border-b-4 border-info/30 shrink-0">
                          <CalendarClock className="w-3.5 h-3.5 text-info" />
                          <span className="text-[10px] sm:text-xs font-bold text-info capitalize whitespace-nowrap">
                {format(stat.nextSession, "MMM d, h:mm a", { locale: currentDateLocale })}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}