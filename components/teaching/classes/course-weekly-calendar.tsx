"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CalendarTimeGridDay,
  CalendarWeekTimeGrid,
} from "@/components/calendar/body/week/calendar-week-time-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
} from "@/lib/academic-settings";

export type CourseClassFormat = "live" | "ignitia" | "abeka";

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
  courseName: string;
  teacherName?: string;
  startMinutes?: number;
  endMinutes?: number;
  backgroundSlots?: CourseWeeklyGuide[];
}

const SNAP_MINUTES = 15;

const formatClasses: Record<CourseClassFormat, string> = {
  live: "border-primary/40 bg-primary/20 text-primary",
  ignitia: "border-secondary/50 bg-secondary/20 text-secondary-foreground",
  abeka: "border-info/40 bg-info/15 text-info",
};

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
        SNAP_MINUTES,
    ) * SNAP_MINUTES;

  return isStart
    ? Math.max(
        windowStartMinutes,
        Math.min(minutes, windowEndMinutes - SNAP_MINUTES),
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
        ? Math.min(startMinutes + SNAP_MINUTES, windowEndMinutes)
        : endMinutes,
  };
}

function formatMinutes(minutes: number) {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60) % 24, minutes % 60, 0, 0);
  return format(date, "h:mm a");
}

export function CourseWeeklyCalendar({
  value,
  onChangeAction,
  courseName,
  teacherName,
  startMinutes = DEFAULT_SCHEDULE_START_MINUTES,
  endMinutes = DEFAULT_SCHEDULE_END_MINUTES,
  backgroundSlots = [],
}: CourseWeeklyCalendarProps) {
  const t = useTranslations();
  const [draft, setDraft] = useState<DraftSelection>();
  const [pending, setPending] =
    useState<ReturnType<typeof normalizeSelection>>();

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
  };

  const addSelection = (sessionType: CourseClassFormat) => {
    if (!pending) return;
    const overlaps = value.some(
      (slot) =>
        slot.dayOfWeek === pending.dayOfWeek &&
        slot.startMinutes < pending.endMinutes &&
        slot.endMinutes > pending.startMinutes,
    );

    if (overlaps) {
      toast.error(t("class.classTimeOverlap"));
      setPending(undefined);
      return;
    }

    onChangeAction([
      ...value,
      {
        ...pending,
        id: `${Date.now()}-${pending.dayOfWeek}-${pending.startMinutes}`,
        sessionType,
      },
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
            : formatClasses[selection.sessionType || "live"],
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
            <span className="block truncate font-normal">
              {selection.sessionType === "live"
                ? teacherName || t("navigation.teacher")
                : selection.sessionType === "ignitia"
                  ? "Ignitia"
                  : "Abeka"}
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
            onClick={() =>
              onChangeAction(value.filter((slot) => slot.id !== selection.id))
            }
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

  return (
    <>
      <div
        className="overflow-hidden rounded-lg border bg-sidebar"
        style={{
          height: ((endMinutes - startMinutes) / 60) * 48 + 30,
        }}
      >
        <CalendarWeekTimeGrid
          date={new Date()}
          startMinutes={startMinutes}
          endMinutes={endMinutes}
          className="[--calendar-hour-height:3rem] [&>div]:overflow-y-hidden xl:[--calendar-hour-height:3rem] 2xl:[--calendar-hour-height:3rem]"
          renderDayAction={(day) => {
            const dayOfWeek = day.getDay();
            const daySlots = value.filter(
              (slot) => slot.dayOfWeek === dayOfWeek,
            );
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
          }}
        />
      </div>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(undefined)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("schedule.sessionFormat")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => addSelection("live")}>
              {t("class.typeStandard")}
            </Button>
            <Button variant="outline" onClick={() => addSelection("ignitia")}>
              Ignitia
            </Button>
            <Button variant="outline" onClick={() => addSelection("abeka")}>
              Abeka
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
