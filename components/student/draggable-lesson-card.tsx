"use client";

import { motion } from "framer-motion";
import { format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import {
  Clock,
  GripVertical,
  MonitorPlay,
  Video,
  AlertCircle,
  RotateCcw,
  Radio,
  Sparkles,
  PlayCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations, useLocale } from "next-intl";
import { StudentScheduleEvent } from "@/lib/types/student";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { TZDate } from "@date-fns/tz";

interface DraggableLessonCardProps {
  lesson: StudentScheduleEvent;
  onDragStart: (lesson: StudentScheduleEvent) => void;
  onDragEnd: () => void;
  onTap?: (lesson: StudentScheduleEvent) => void;
  isPast?: boolean;
}

export function DraggableLessonCard({
  lesson,
  onDragStart,
  onDragEnd,
  onTap,
  isPast = false,
}: DraggableLessonCardProps) {
  const t = useTranslations("student");
  const locale = useLocale();
  const dateLocale = locale === "es" ? es : locale === "pt-BR" ? ptBR : enUS;
  const startDate = new TZDate(lesson.start, lesson.timeZone);
  const endDate = new TZDate(lesson.end, lesson.timeZone);

  const [now, setNow] = useState(Date.now());

  const timeToStart = lesson.start - now;

  const isIgnitia = lesson.sessionType === "ignitia";
  const isAbeka = lesson.sessionType === "abeka";
  const isVirtual = isIgnitia || isAbeka;

  // Update timer
  useEffect(() => {
    if (now > lesson.end + 1000 && !isVirtual && !lesson.isStudentActive)
      return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [lesson.end, isVirtual, lesson.isStudentActive, now]);

  // --- 🧠 STATE LOGIC ---
  const isInClass = lesson.isStudentActive;
  const isPresent = lesson.attendance === "present";
  const isExcused = lesson.attendance === "excused";
  const isPartialFinal = lesson.attendance === "partial";
  const isPendingVerification = lesson.attendance === "pending";
  const isLiveWindow = now >= lesson.start && now < lesson.end;
  const isLate = !isVirtual && isLiveWindow && !isInClass && !isPresent;
  const isMissed = lesson.attendance === "absent";
  const isUrgent = timeToStart > 0 && timeToStart <= 5 * 60 * 1000;

  const isVirtualPending =
    isVirtual && (isPast || now > lesson.end) && isPendingVerification;

  const canDrag =
    (isVirtual && now < lesson.end) ||
    isInClass ||
    isLiveWindow ||
    now < lesson.start;

  const formatCountdown = (ms: number) => {
    const absMs = Math.abs(ms);
    const minutes = Math.floor(absMs / 60000);
    const seconds = Math.floor((absMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // --- 🎨 VISUAL STYLES ---
  const getCardStyle = () => {
    if (isInClass)
      return "bg-success/10 border-success border-b-[6px] ring-2 ring-success ring-offset-2 ring-offset-background animate-pulse-slow";

    if (isLate) {
      return "bg-destructive/10 border-destructive border-b-[6px] shadow-xl shadow-destructive/20";
    }

    if (isVirtual) {
      if (lesson.isLive || (now >= lesson.start && now <= lesson.end)) {
        return isAbeka
          ? "bg-info/15 border-info border-b-[6px]"
          : "bg-secondary/15 border-secondary border-b-[6px]";
      }
      return isAbeka
        ? "bg-info/10 border-info/40 border-b-[6px] shadow-sm"
        : "bg-secondary/10 border-secondary/40 border-b-[6px] shadow-sm";
    }

    if (isMissed)
      return "bg-muted border-neutral-status/40 border-b-4 opacity-60 grayscale";
    if (isPresent) return "bg-card border-success/30 border-b-4 opacity-80";
    if (isPartialFinal)
      return "bg-card border-warning/30 border-b-4 opacity-80";
    if (isExcused) return "bg-card border-info/30 border-b-4 opacity-80";
    if (isUrgent)
      return "bg-warning/10 border-warning border-b-[6px] shadow-lg shadow-warning/20";
    if (lesson.isLive)
      return "bg-success/15 border-success border-b-[6px] shadow-md";

    return "bg-primary/10 border-primary border-b-[6px] shadow-sm hover:shadow-md transition-shadow";
  };

  const getTextColor = () => {
    if (isMissed) return "text-neutral-status";
    if (isLate) return "text-destructive";
    if (isAbeka) return "text-info";
    if (isIgnitia) return "text-secondary";
    return "text-foreground";
  };

  const showTrailingBadge =
    (isMissed ||
      isPresent ||
      isPartialFinal ||
      isExcused ||
      isPendingVerification ||
      isVirtualPending) &&
    !isInClass;
  const [recordingOpen, setRecordingOpen] = useState(false);
  const canWatchRecording = !!lesson.hasRecording;

  return (
    <motion.div
      draggable={canDrag}
      onDragStart={() => canDrag && onDragStart(lesson)}
      onDragEnd={onDragEnd}
      onClick={() => canDrag && onTap && onTap(lesson)}
      whileHover={canDrag ? { scale: 1.01, y: -2 } : {}}
      className={cn(
        "relative rounded-2xl border-2 p-4 transition-all duration-150 select-none",
        canDrag
          ? "cursor-pointer touch-manipulation active:border-b-2 active:translate-y-[4px]"
          : "cursor-default touch-none",
        getCardStyle(),
      )}
      style={{
        borderColor:
          !isMissed &&
          !isIgnitia &&
          !lesson.isLive &&
          !isLate &&
          !isUrgent &&
          !isInClass
            ? lesson.color
            : undefined,
      }}
    >
      {/* Sparkles */}
      {canDrag && !lesson.isLive && (
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
            ease: "easeInOut",
          }}
        >
          <Sparkles
            className={cn(
              "w-6 h-6 opacity-80",
              isLate
                ? "text-destructive"
                : isIgnitia
                  ? "text-secondary"
                  : "text-warning",
            )}
          />
        </motion.div>
      )}

      {canDrag && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-card rounded-full p-1 shadow-md border-2 border-border z-20 lg:block hidden">
          <GripVertical className="w-5 h-5 text-muted-foreground" />
        </div>
      )}

      {/* --- BADGES --- */}
      {isInClass && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-3 left-8 z-10"
        >
          <Badge className="bg-success text-success-foreground font-bold border-2 border-background shadow-md animate-pulse">
            <Radio className="w-3 h-3 mr-1" />
            In Class
          </Badge>
        </motion.div>
      )}

      {/* 🔴 LATE BADGE */}
      {isLate && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-3 right-8 z-10"
        >
          <Badge className="bg-destructive/15 text-destructive border-destructive/40 animate-pulse font-mono font-bold shadow-sm border-2">
            <AlertCircle className="w-3 h-3 mr-1" />
            {t("late")}: {formatCountdown(now - lesson.start)}
          </Badge>
        </motion.div>
      )}

      {/* 🟡 URGENT / UPCOMING BADGE (Starts in < 5 mins) */}
      {isUrgent && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-3 right-8 z-10"
        >
          <Badge className="bg-warning/15 text-warning border-warning/40 animate-pulse font-mono font-bold shadow-sm border-2">
            <Clock className="w-3 h-3 mr-1" />
            {formatCountdown(lesson.start - now)}
          </Badge>
        </motion.div>
      )}

      {/* ✅ TRAILING BADGE (Status) */}
      {showTrailingBadge && (
        <Badge
          className={cn(
            "absolute -top-3 -right-3 z-10 border-2",
            isPendingVerification
              ? "bg-secondary/15 text-secondary border-secondary/40"
              : isPresent
                ? "bg-success text-success-foreground border-success"
                : isPartialFinal
                  ? "bg-warning text-warning-foreground border-warning"
                  : isExcused
                    ? "bg-info text-info-foreground border-info"
                    : "bg-neutral-status text-neutral-status-foreground border-neutral-status",
          )}
        >
          {isPendingVerification ? (
            <span className="flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              {t("pending")}
            </span>
          ) : isPresent ? (
            `✓ ${t("attended")}`
          ) : isPartialFinal ? (
            `~ ${t("partial")}`
          ) : isExcused ? (
            `✓ ${t("excused")}`
          ) : (
            `⚠ ${t("missed")}`
          )}
        </Badge>
      )}

      {/* Time Circle */}
      <div className="flex items-start gap-3 relative z-10">
        <div
          className={cn(
            "flex-shrink-0 w-16 h-16 rounded-full bg-card border-4 flex flex-col items-center justify-center shadow-md",
            isLate
              ? "border-destructive/30"
              : isIgnitia
                ? "border-secondary/30"
                : "",
            isMissed ? "grayscale opacity-50 border-neutral-status/40" : "",
          )}
          style={{
            borderColor:
              !isMissed && !isIgnitia && !isLate && !isUrgent && !isInClass
                ? lesson.color
                : undefined,
          }}
        >
          <span className="text-xs font-bold text-muted-foreground">
            {format(startDate, "MMM", { locale: dateLocale })}
          </span>
          <span
            className={cn(
              "text-2xl font-black text-foreground",
              isLate ? "text-destructive" : "",
            )}
          >
            {format(startDate, "d")}
          </span>
        </div>

        {/* Content */}
        <div className={cn("flex-1 min-w-0", isMissed && "opacity-60")}>
          <div className="flex items-center gap-2 mb-1">
            <h3 className={cn("text-lg font-black truncate", getTextColor())}>
              {lesson.title}
            </h3>
            {isVirtual && (
              <div
                className={cn(
                  "p-1 rounded-md",
                  isAbeka
                    ? "bg-info/15 text-info"
                    : "bg-secondary/15 text-secondary",
                )}
              >
                <MonitorPlay className="w-4 h-4" />
              </div>
            )}
            {!isVirtual && !isMissed && (
              <div className="bg-info/15 text-info p-1 rounded-md">
                <Video className="w-4 h-4" />
              </div>
            )}
          </div>
          <p className="text-sm font-bold text-muted-foreground truncate mb-2">
            📚 {lesson.className}
          </p>

          <div className="flex flex-wrap gap-2 text-xs">
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full",
                isLate
                  ? "bg-destructive/15 text-destructive font-bold"
                  : "bg-background/80 text-foreground",
              )}
            >
              <Clock className="w-3 h-3" />
              <span className="font-bold">
                {format(startDate, "h:mm a", { locale: dateLocale })} -{" "}
                {format(endDate, "h:mm a", { locale: dateLocale })} ·{" "}
                {lesson.timeZone}
              </span>
            </div>
            {lesson.minutesAttended > 0 && (
              <div className="flex items-center gap-1 bg-success/15 text-success px-2 py-1 rounded-full font-bold">
                <Clock className="w-3 h-3" />
                {lesson.minutesAttended}m
              </div>
            )}
          </div>
        </div>
      </div>

      {canDrag && !isInClass && (
        <div
          className={cn(
            "mt-3 text-center text-xs font-bold animate-bounce relative z-10",
            isLate ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {/* Shows on mobile and tablet, hides on desktop */}
          <span className="lg:hidden">👆 {t("tapHint") || "Tap me! 🚀"}</span>

          {/* Hides on mobile and tablet, shows on desktop */}
          <span className="hidden lg:inline">
            👆 {t("dragHint") || "Drag me! 🚀"}
          </span>
        </div>
      )}

      {/* Watch Recording — shown for past sessions with a recording */}
      {canWatchRecording && (
        <div
          className="mt-3 relative z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setRecordingOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-sm font-semibold transition-colors"
          >
            <PlayCircle className="h-4 w-4" />
            {t("watchRecording") || "Watch Recording"}
          </button>
          <RecordingPlayerModal
            scheduleId={lesson.scheduleId}
            title={lesson.className || lesson.title}
            secondaryLabel={
              isIgnitia ? "Ignitia" : isAbeka ? "Abeka" : undefined
            }
            scheduledStart={lesson.start}
            scheduledEnd={lesson.end}
            timeZone={lesson.timeZone}
            open={recordingOpen}
            onOpenChange={setRecordingOpen}
            variant="student"
          />
        </div>
      )}
    </motion.div>
  );
}
