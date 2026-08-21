"use client";

import { useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { tz } from "@date-fns/tz";
import { enUS, es, ptBR } from "date-fns/locale";
import { Trash2, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CalendarTimeGridDay,
  CalendarWeekTimeGrid,
} from "@/components/calendar/body/week/calendar-week-time-grid";
import CalendarBodyMarginDayMargin from "@/components/calendar/body/day/calendar-body-margin-day-margin";
import { CalendarProviderMark } from "@/components/calendar/calendar-provider-mark";
import { getCalendarProviderAppearanceClasses } from "@/components/calendar/calendar-tailwind-classes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  COURSE_SCHEDULE_STEP_MINUTES,
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
} from "@/lib/academic-settings";

import type { ClassSessionType } from "@/lib/class-session";

export type CourseClassFormat = ClassSessionType;

export type CourseWeeklySlot = {
  id: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  sessionType: CourseClassFormat;
};

export type CourseWeeklyGuide = {
  id: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  label: string;
};

interface DraftSelection {
  dayOfWeek: number;
  anchorMinutes: number;
  currentMinutes: number;
}

interface CourseWeeklyCalendarProps {
  value: CourseWeeklySlot[];
  onChangeAction: (value: CourseWeeklySlot[]) => void;
  onRemoveAction: (slot: CourseWeeklySlot) => void;
  courseName: string;
  teacherName?: string;
  startMinutes?: number;
  endMinutes?: number;
  backgroundSlots?: CourseWeeklyGuide[];
  timeZone: string;
}

const localeMap = {
  en: enUS,
  es,
  "pt-BR": ptBR,
} as const;

const liveFormatClasses = "border-primary/40 bg-primary/20 text-primary";
const TIME_INPUT_STEP_SECONDS = 60;

function getFormatClasses(sessionType: CourseClassFormat) {
  const provider = getCalendarProviderAppearanceClasses(sessionType);
  return provider ? cn(provider.event, provider.text) : liveFormatClasses;
}

function getPointerMinutes(
  event: React.PointerEvent<HTMLDivElement>,
  isStart: boolean,
  windowStartMinutes: number,
  windowEndMinutes: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const surfaceHeight = event.currentTarget.scrollHeight || rect.height;
  const ratio = (event.clientY - rect.top) / surfaceHeight;
  const minutes =
    Math.round(
      (windowStartMinutes +
        Math.max(0, Math.min(1, ratio)) *
          (windowEndMinutes - windowStartMinutes)) /
        COURSE_SCHEDULE_STEP_MINUTES,
    ) * COURSE_SCHEDULE_STEP_MINUTES;

  return isStart
    ? Math.max(
        windowStartMinutes,
        Math.min(minutes, windowEndMinutes - COURSE_SCHEDULE_STEP_MINUTES),
      )
    : Math.max(windowStartMinutes, Math.min(minutes, windowEndMinutes));
}

function normalizeSelection(
  selection: DraftSelection,
  windowEndMinutes: number,
) {
  const startMinutes = Math.min(
    selection.anchorMinutes,
    selection.currentMinutes,
  );
  const endMinutes = Math.max(
    selection.anchorMinutes,
    selection.currentMinutes,
  );

  return {
    dayOfWeek: selection.dayOfWeek,
    startMinutes,
    endMinutes:
      endMinutes === startMinutes
        ? Math.min(
            startMinutes + COURSE_SCHEDULE_STEP_MINUTES,
            windowEndMinutes,
          )
        : endMinutes,
  };
}

function formatMinutes(minutes: number) {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60) % 24, minutes % 60, 0, 0);
  return format(date, "h:mm a");
}

function formatTimeInput(minutes: number) {
  const hours = (Math.floor(minutes / 60) % 24).toString().padStart(2, "0");
  const remainingMinutes = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainingMinutes}`;
}

function parseTimeInput(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return undefined;
  }

  return hours * 60 + minutes;
}

export function CourseWeeklyCalendar({
  value,
  onChangeAction,
  onRemoveAction,
  courseName,
  teacherName,
  startMinutes = DEFAULT_SCHEDULE_START_MINUTES,
  endMinutes = DEFAULT_SCHEDULE_END_MINUTES,
  backgroundSlots = [],
  timeZone,
}: CourseWeeklyCalendarProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;
  const [draft, setDraft] = useState<DraftSelection>();
  const [pending, setPending] =
    useState<ReturnType<typeof normalizeSelection>>();
  const [pendingSessionType, setPendingSessionType] =
    useState<CourseClassFormat>("live");
  const [pendingDays, setPendingDays] = useState<number[]>([]);
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(1);
  const dateContext = { in: tz(timeZone) };
  const weekStart = startOfWeek(new Date(), {
    weekStartsOn: 1,
    ...dateContext,
  });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index, dateContext),
  );

  const startSelection = (
    dayOfWeek: number,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const minutes = getPointerMinutes(event, true, startMinutes, endMinutes);
    setDraft({
      dayOfWeek,
      anchorMinutes: minutes,
      currentMinutes: minutes,
    });
  };

  const updateSelection = (
    dayOfWeek: number,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!draft || draft.dayOfWeek !== dayOfWeek) return;
    const currentMinutes = getPointerMinutes(
      event,
      false,
      startMinutes,
      endMinutes,
    );
    setDraft((current) => (current ? { ...current, currentMinutes } : current));
  };

  const finishSelection = (
    dayOfWeek: number,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!draft || draft.dayOfWeek !== dayOfWeek) return;
    const selection = normalizeSelection(
      {
        ...draft,
        currentMinutes: getPointerMinutes(
          event,
          false,
          startMinutes,
          endMinutes,
        ),
      },
      endMinutes,
    );
    setDraft(undefined);
    setPending(selection);
    setPendingSessionType("live");
    setPendingDays([selection.dayOfWeek]);
  };

  const addSelection = () => {
    if (!pending) return;
    if (pendingDays.length === 0) {
      toast.error(t("class.selectScheduleDays"));
      return;
    }

    const hasValidTime =
      Number.isInteger(pending.startMinutes) &&
      Number.isInteger(pending.endMinutes) &&
      pending.startMinutes >= startMinutes &&
      pending.endMinutes <= endMinutes &&
      pending.startMinutes < pending.endMinutes;
    if (!hasValidTime) {
      toast.error(t("class.invalidScheduleTime"));
      return;
    }

    const overlaps = pendingDays.some((dayOfWeek) =>
      value.some(
        (slot) =>
          slot.dayOfWeek === dayOfWeek &&
          slot.startMinutes < pending.endMinutes &&
          slot.endMinutes > pending.startMinutes,
      ),
    );

    if (overlaps) {
      toast.error(t("class.classTimeOverlap"));
      return;
    }

    onChangeAction([
      ...value,
      ...pendingDays.map((dayOfWeek) => ({
        ...pending,
        dayOfWeek,
        id: `${Date.now()}-${dayOfWeek}-${pending.startMinutes}`,
        sessionType: pendingSessionType,
      })),
    ]);
    setPending(undefined);
  };

  const renderSelection = (
    selection: {
      startMinutes: number;
      endMinutes: number;
      sessionType?: CourseClassFormat;
      id?: string;
    },
    isDraft = false,
  ) => {
    const windowMinutes = endMinutes - startMinutes;
    const top = ((selection.startMinutes - startMinutes) / windowMinutes) * 100;
    const height =
      ((selection.endMinutes - selection.startMinutes) / windowMinutes) * 100;

    return (
      <div
        key={selection.id || "draft"}
        className={cn(
          "absolute inset-x-1 z-10 overflow-hidden rounded-md border px-1.5 py-1 text-[10px] font-semibold shadow-sm",
          isDraft
            ? "pointer-events-none border-primary/50 bg-primary/15 text-primary"
            : getFormatClasses(selection.sessionType || "live"),
        )}
        style={{ top: `${top}%`, height: `${height}%` }}
        onPointerDown={isDraft ? undefined : (event) => event.stopPropagation()}
      >
        {isDraft ? (
          <span className="block truncate">
            {formatMinutes(selection.startMinutes)}–
            {formatMinutes(selection.endMinutes)}
          </span>
        ) : (
          <>
            <span className="block truncate">
              {courseName.trim() || t("class.class")}
            </span>
            <span className="flex min-w-0 items-center gap-1 font-normal">
              <CalendarProviderMark
                sessionType={selection.sessionType || "live"}
                className="size-3"
              />
              <span className="truncate">
                {selection.sessionType === "live"
                  ? teacherName || t("navigation.teacher")
                  : selection.sessionType === "ignitia"
                    ? t("schedule.typeIgnitia")
                    : t("schedule.typeAbeka")}
              </span>
            </span>
            <span className="block truncate font-normal">
              {formatMinutes(selection.startMinutes)}–
              {formatMinutes(selection.endMinutes)}
            </span>
          </>
        )}
        {!isDraft && selection.id && (
          <button
            type="button"
            className="absolute right-1 top-1 rounded-sm p-0.5 hover:bg-sidebar/80"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              const slot = value.find(
                (candidate) => candidate.id === selection.id,
              );
              if (slot) onRemoveAction(slot);
            }}
            aria-label={t("common.delete")}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  const renderBackgroundSlot = (slot: CourseWeeklyGuide) => {
    const visibleStart = Math.max(slot.startMinutes, startMinutes);
    const visibleEnd = Math.min(slot.endMinutes, endMinutes);
    if (visibleEnd <= visibleStart) return null;

    const windowMinutes = endMinutes - startMinutes;
    const top = ((visibleStart - startMinutes) / windowMinutes) * 100;
    const height = ((visibleEnd - visibleStart) / windowMinutes) * 100;

    return (
      <div
        key={slot.id}
        className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-muted-foreground/30 bg-muted/70 px-1.5 py-1 text-[10px] text-muted-foreground opacity-70"
        style={{ top: `${top}%`, height: `${height}%` }}
      >
        <span className="block truncate font-medium">{slot.label}</span>
        <span className="block truncate">
          {formatMinutes(slot.startMinutes)}–{formatMinutes(slot.endMinutes)}
        </span>
      </div>
    );
  };

  const renderEditableDay = (day: Date, showHeader = true) => {
    const dayOfWeek = day.getDay();
    const daySlots = value.filter((slot) => slot.dayOfWeek === dayOfWeek);
    const dayBackgroundSlots = backgroundSlots.filter(
      (slot) => slot.dayOfWeek === dayOfWeek,
    );
    const draftSelection =
      draft?.dayOfWeek === dayOfWeek
        ? normalizeSelection(draft, endMinutes)
        : undefined;

    return (
      <CalendarTimeGridDay
        date={day}
        onlyDayHeader
        startMinutes={startMinutes}
        endMinutes={endMinutes}
        displayTimeZone={timeZone}
        showHeader={showHeader}
        surfaceProps={{
          className: "cursor-crosshair touch-none select-none",
          onPointerDown: (event) => startSelection(dayOfWeek, event),
          onPointerMove: (event) => updateSelection(dayOfWeek, event),
          onPointerUp: (event) => finishSelection(dayOfWeek, event),
          onPointerCancel: () => setDraft(undefined),
        }}
      >
        {dayBackgroundSlots.map(renderBackgroundSlot)}
        {daySlots.map((slot) => renderSelection(slot))}
        {draftSelection && renderSelection(draftSelection, true)}
      </CalendarTimeGridDay>
    );
  };

  const selectedDay =
    weekDays.find((day) => day.getDay() === selectedDayOfWeek) ?? weekDays[0];
  const calendarHeight = ((endMinutes - startMinutes) / 60) * 48;

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-sidebar md:hidden">
        <div className="grid grid-cols-7 gap-1 border-b p-2">
          {weekDays.map((day) => {
            const dayOfWeek = day.getDay();
            const hasCourseSlots = value.some(
              (slot) => slot.dayOfWeek === dayOfWeek,
            );
            const hasBackgroundSlots = backgroundSlots.some(
              (slot) => slot.dayOfWeek === dayOfWeek,
            );

            return (
              <button
                key={day.toISOString()}
                type="button"
                className={cn(
                  "flex min-h-12 min-w-0 flex-col items-center justify-center rounded-md border px-1 text-center transition-colors",
                  selectedDayOfWeek === dayOfWeek
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/60",
                )}
                onClick={() => setSelectedDayOfWeek(dayOfWeek)}
              >
                <span className="text-[10px] font-semibold uppercase">
                  {format(day, "EEE", {
                    locale: dateLocale,
                    ...dateContext,
                  })}
                </span>
                <span
                  className={cn(
                    "mt-1 size-1.5 rounded-full",
                    hasCourseSlots
                      ? "bg-primary"
                      : hasBackgroundSlots
                        ? "bg-muted-foreground/50"
                        : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>

        <div
          className="flex overflow-hidden [--calendar-hour-height:3rem]"
          style={{ height: calendarHeight }}
        >
          <CalendarBodyMarginDayMargin
            startMinutes={startMinutes}
            endMinutes={endMinutes}
            displayTimeZone={timeZone}
            showHeader={false}
          />
          {renderEditableDay(selectedDay, false)}
        </div>
      </div>

      <div
        className="hidden overflow-hidden rounded-lg border bg-sidebar md:block"
        style={{ height: calendarHeight + 30 }}
      >
        <CalendarWeekTimeGrid
          date={new Date()}
          startMinutes={startMinutes}
          endMinutes={endMinutes}
          displayTimeZone={timeZone}
          className="[--calendar-hour-height:3rem] [&>div]:overflow-y-hidden xl:[--calendar-hour-height:3rem] 2xl:[--calendar-hour-height:3rem]"
          renderDayAction={(day) => renderEditableDay(day)}
        />
      </div>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(undefined)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("class.addWeeklySchedule")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="course-slot-start-time">
                  {t("class.startTime")}
                </Label>
                <Input
                  id="course-slot-start-time"
                  type="time"
                  step={TIME_INPUT_STEP_SECONDS}
                  min={formatTimeInput(startMinutes)}
                  max={formatTimeInput(endMinutes - 1)}
                  value={pending ? formatTimeInput(pending.startMinutes) : ""}
                  className="appearance-none bg-sidebar [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  onChange={(event) => {
                    const minutes = parseTimeInput(event.target.value);
                    if (minutes === undefined) return;
                    setPending((current) =>
                      current ? { ...current, startMinutes: minutes } : current,
                    );
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="course-slot-end-time">
                  {t("class.endTime")}
                </Label>
                <Input
                  id="course-slot-end-time"
                  type="time"
                  step={TIME_INPUT_STEP_SECONDS}
                  min={formatTimeInput(startMinutes + 1)}
                  max={
                    endMinutes < 24 * 60
                      ? formatTimeInput(endMinutes)
                      : undefined
                  }
                  value={pending ? formatTimeInput(pending.endMinutes) : ""}
                  className="appearance-none bg-sidebar [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  onChange={(event) => {
                    const parsedMinutes = parseTimeInput(event.target.value);
                    if (parsedMinutes === undefined) return;
                    const minutes =
                      parsedMinutes === 0 && endMinutes === 24 * 60
                        ? 24 * 60
                        : parsedMinutes;
                    setPending((current) =>
                      current ? { ...current, endMinutes: minutes } : current,
                    );
                  }}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("class.repeatOnDays")}</Label>
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                value={pendingDays.map(String)}
                onValueChange={(days) =>
                  setPendingDays(days.map(Number).filter(Number.isInteger))
                }
                className="grid w-full grid-cols-4 sm:grid-cols-7"
              >
                {weekDays.map((day) => {
                  const dayOfWeek = day.getDay();
                  return (
                    <ToggleGroupItem
                      key={dayOfWeek}
                      value={String(dayOfWeek)}
                      aria-label={format(day, "EEEE", {
                        locale: dateLocale,
                        ...dateContext,
                      })}
                      className="min-w-0 bg-sidebar data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      {format(day, "EEE", {
                        locale: dateLocale,
                        ...dateContext,
                      })}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>

            <div className="grid gap-2">
              <Label>{t("schedule.sessionFormat")}</Label>
              {(
                [
                  ["live", t("class.typeStandard")],
                  ["ignitia", t("schedule.typeIgnitia")],
                  ["abeka", t("schedule.typeAbeka")],
                ] satisfies [CourseClassFormat, string][]
              ).map(([sessionType, label]) => (
                <Button
                  key={sessionType}
                  type="button"
                  variant={
                    pendingSessionType === sessionType ? "default" : "outline"
                  }
                  className="h-11 justify-start gap-3"
                  aria-pressed={pendingSessionType === sessionType}
                  onClick={() => setPendingSessionType(sessionType)}
                >
                  {sessionType === "live" ? (
                    <Video
                      className={cn(
                        "size-5 shrink-0",
                        pendingSessionType === sessionType
                          ? "text-primary-foreground"
                          : "text-primary",
                      )}
                    />
                  ) : (
                    <CalendarProviderMark
                      sessionType={sessionType}
                      className="size-5"
                    />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPending(undefined)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={addSelection}>
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
