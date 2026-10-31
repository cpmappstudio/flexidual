"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { GradeCheckboxList } from "@/components/teaching/classes/grade-checkbox-list";
import { TeacherAssignmentPicker } from "@/components/teacher-assignment-picker";
import { EventOverlapNotice } from "@/components/events/event-overlap-notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  firstWeeklyDate,
  formatWeeklyDate,
  MAX_EVENT_WEEKS,
  weeklyDuration,
} from "@/lib/event-weekly-schedule";
import {
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
} from "@/lib/academic-settings";
import { getEventScheduleTimeIssue } from "@/lib/event-schedule-window";
import {
  addCivilDays,
  civilDayNumber,
  isValidCivilDate,
  localDateTimeToUtc,
  todayInTimeZone,
  utcToLocalDateTime,
} from "@/lib/time-zone";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useEventClassConflicts } from "@/hooks/use-event-class-conflicts";
import { ROUTES } from "@/lib/navigation/routes";

type EditableEvent = NonNullable<FunctionReturnType<typeof api.events.get>>;
const requiredMark = (
  <span
    aria-hidden="true"
    data-slot="required-field-mark"
    className="text-destructive before:content-['*']"
  />
);

export function CalendarEventFormDialog({
  schoolId,
  campusId,
  schoolTimeZone,
  selectedDate,
  canCreateInstitution,
  open,
  onOpenChange,
  onCreated,
  event,
}: {
  schoolId: Id<"schools">;
  campusId?: Id<"campuses">;
  schoolTimeZone: string;
  selectedDate: string;
  canCreateInstitution: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (eventId: Id<"events">) => void;
  event?: EditableEvent;
}) {
  const t = useTranslations("events");
  const now = useCurrentMinute();
  const [initialNow] = useState(Date.now);
  const editingNow = Math.max(initialNow, now);
  const audienceId = useId();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ orgSlug: string }>();
  const create = useMutation(api.events.create);
  const update = useMutation(api.events.updateDetails);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<string>(campusId ?? "school");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gradeCodes, setGradeCodes] = useState<string[]>([]);
  const [audienceMode, setAudienceMode] = useState<"all" | "specific">("all");
  const [responsibleId, setResponsibleId] = useState("");
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [repeat, setRepeat] = useState<"single" | "weekly">("single");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [weeklyStartTime, setWeeklyStartTime] = useState("");
  const [weeklyEndTime, setWeeklyEndTime] = useState("");
  const [weeklyStartDate, setWeeklyStartDate] = useState("");
  const [weeklyEndDate, setWeeklyEndDate] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"keep" | "replace">("keep");
  const [scheduleReason, setScheduleReason] = useState("");
  const [scheduleBaseline, setScheduleBaseline] = useState<{
    futureCount: number;
    futureFingerprint: string;
  } | null>(null);
  const [initialScheduleFingerprint, setInitialScheduleFingerprint] =
    useState("");
  const initializedEventId = useRef<Id<"events"> | "create" | null>(null);
  const editingSchedule = useQuery(
    api.events.getEditingSchedule,
    open && event ? { eventId: event._id, now: editingNow } : "skip",
  );
  const school = useQuery(api.schools.get, open ? { id: schoolId } : "skip");
  const campuses = useQuery(
    api.campuses.list,
    open && canCreateInstitution ? { schoolId, isActive: true } : "skip",
  );
  const currentCampus = useQuery(
    api.campuses.get,
    open && campusId && !canCreateInstitution ? { id: campusId } : "skip",
  );
  const grades = useQuery(api.grades.list, open ? { schoolId } : "skip");
  const activeRoom = useQuery(
    api.events.hasActiveRoom,
    open && event ? { eventId: event._id } : "skip",
  );
  const selectedCampus = campuses?.find((campus) => campus._id === scope);
  const selectedCampusId =
    scope === "school" ? undefined : (scope as Id<"campuses">);
  const timeZone =
    event && event.campusId === selectedCampusId
      ? event.timeZone
      : scope === "school"
        ? (school?.timeZone ?? schoolTimeZone)
        : (selectedCampus?.timeZone ??
          currentCampus?.timeZone ??
          schoolTimeZone);
  const timeZoneReady =
    Boolean(school) &&
    (scope === "school" ||
      (canCreateInstitution
        ? selectedCampus !== undefined
        : currentCampus !== undefined));
  const windowStart =
    school?.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES;
  const windowEnd = school?.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES;
  const windowTime = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const singleTimeIssue =
    school && start && end
      ? getEventScheduleTimeIssue(start, end, windowStart, windowEnd)
      : null;
  const weeklyTimeIssue =
    school && weeklyStartTime && weeklyEndTime
      ? getEventScheduleTimeIssue(
          `2000-01-01T${weeklyStartTime}`,
          `2000-01-01T${weeklyEndTime}`,
          windowStart,
          windowEnd,
        )
      : null;
  const firstDate = firstWeeklyDate(weeklyStartDate, days);
  const localNow = timeZoneReady ? utcToLocalDateTime(now, timeZone) : "";
  const firstScheduledDate =
    !event && repeat === "weekly" && firstDate && weeklyStartTime && localNow
      ? days
          .map((day) => {
            const date = firstWeeklyDate(
              weeklyStartDate > localNow.slice(0, 10)
                ? weeklyStartDate
                : localNow.slice(0, 10),
              [day],
            )!;
            return date === localNow.slice(0, 10) &&
              weeklyStartTime <= localNow.slice(11)
              ? addCivilDays(date, 7)
              : date;
          })
          .sort()[0]
      : firstDate;
  const singleStartInPast =
    repeat === "single" && !!start && !!localNow && start <= localNow;
  const singleScheduleAlert =
    !start || !end
      ? null
      : singleTimeIssue === "outsideWindow"
        ? "outsideScheduleWindow"
        : singleTimeIssue === "differentDay"
          ? "sameDayRequired"
          : singleTimeIssue
            ? "endMustFollowStart"
            : singleStartInPast
              ? "startMustBeFuture"
              : null;
  const weeklyFirstDateInPast =
    !!event &&
    repeat === "weekly" &&
    !!firstDate &&
    !!weeklyStartTime &&
    !!localNow &&
    `${firstDate}T${weeklyStartTime}` <= localNow;
  const weeklyDurationMinutes =
    weeklyDuration(weeklyStartTime, weeklyEndTime) ?? 0;
  const weeklyDatesReversed =
    !!weeklyStartDate && !!weeklyEndDate && weeklyEndDate < weeklyStartDate;
  const weeklyRangeTooLong =
    isValidCivilDate(weeklyStartDate) &&
    isValidCivilDate(weeklyEndDate) &&
    civilDayNumber(weeklyEndDate) - civilDayNumber(weeklyStartDate) >
      MAX_EVENT_WEEKS * 7;
  const weeklyNoDays = repeat === "weekly" && days.length === 0;
  const noWeeklySelectedDay =
    !weeklyNoDays &&
    !weeklyDatesReversed &&
    !!firstDate &&
    !!weeklyEndDate &&
    weeklyEndDate < firstDate;
  const noFutureWeeklySessions =
    !event &&
    !!firstScheduledDate &&
    !!weeklyEndDate &&
    weeklyEndDate < firstScheduledDate;
  const weeklyScheduleAlert = weeklyNoDays
    ? "selectWeeklyDay"
    : !weeklyStartTime || !weeklyEndTime
      ? null
      : weeklyTimeIssue === "outsideWindow"
        ? "outsideScheduleWindow"
        : weeklyTimeIssue
          ? "endTimeMustFollowStart"
          : !weeklyStartDate || !weeklyEndDate
            ? null
            : weeklyDatesReversed
              ? "repeatUntilBeforeFrom"
              : weeklyRangeTooLong
                ? "weeklyRangeTooLong"
                : noWeeklySelectedDay
                  ? "noWeeklySessionsInRange"
                  : weeklyFirstDateInPast
                    ? "replacementDatesMustBeFuture"
                    : noFutureWeeklySessions
                      ? "noFutureWeeklySessions"
                      : null;
  const invalidWeeklyRange =
    repeat === "weekly" &&
    (!firstDate ||
      !weeklyEndDate ||
      !weeklyDurationMinutes ||
      !!weeklyScheduleAlert);
  const scheduleValid =
    repeat === "single"
      ? !!start && !!end && !singleScheduleAlert
      : !invalidWeeklyRange;
  const scheduleFingerprint = JSON.stringify(
    repeat === "single"
      ? { repeat, start, end }
      : {
          repeat,
          weeklyStartDate,
          weeklyEndDate,
          weeklyStartTime,
          weeklyEndTime,
          days: [...days].sort(),
        },
  );
  const scheduleChanged =
    scheduleMode === "replace" &&
    (scheduleBaseline?.futureCount === 0 ||
      scheduleFingerprint !== initialScheduleFingerprint);
  const scheduleDraft = useMemo(() => {
    if (!scheduleValid || !timeZoneReady) return null;
    if (repeat === "weekly")
      return {
        kind: "weekly" as const,
        startDate: weeklyStartDate,
        endDate: weeklyEndDate,
        slots: days.map((dayOfWeek) => ({
          dayOfWeek,
          startMinutes:
            Number(weeklyStartTime.slice(0, 2)) * 60 +
            Number(weeklyStartTime.slice(3, 5)),
          durationMinutes: weeklyDurationMinutes,
        })),
      };
    try {
      return {
        kind: "single" as const,
        start: localDateTimeToUtc(start, timeZone),
        end: localDateTimeToUtc(end, timeZone),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("INVALID_LOCAL_DATE_TIME")
      )
        return null;
      throw error;
    }
  }, [
    days,
    end,
    repeat,
    scheduleValid,
    start,
    timeZone,
    timeZoneReady,
    weeklyDurationMinutes,
    weeklyEndDate,
    weeklyStartDate,
    weeklyStartTime,
  ]);
  const changePreview = useQuery(
    api.events.previewScheduleChange,
    open && event && scheduleChanged && scheduleBaseline && scheduleDraft
      ? {
          eventId: event._id,
          campusId: selectedCampusId,
          schedule: scheduleDraft,
          now: editingNow,
        }
      : "skip",
  );
  const previewIsCurrent =
    !!scheduleBaseline &&
    changePreview &&
    !("error" in changePreview) &&
    changePreview.futureCount === scheduleBaseline?.futureCount &&
    changePreview.futureFingerprint === scheduleBaseline.futureFingerprint;
  const removedCount = previewIsCurrent ? changePreview.removedCount : 0;
  const addedCount = previewIsCurrent ? changePreview.addedCount : 0;
  const conflicts = useEventClassConflicts({
    schoolId,
    campusId: selectedCampusId,
    gradeCodes,
    start,
    end,
    timeZone,
    enabled:
      open &&
      (!event || scheduleMode !== "keep") &&
      repeat === "single" &&
      scheduleValid &&
      (!event || scheduleChanged),
  });
  const teachers = useQuery(
    api.events.listTeacherOptions,
    open
      ? {
          schoolId,
          campusId: selectedCampusId,
        }
      : "skip",
  );

  useEffect(() => {
    if (!open) {
      initializedEventId.current = null;
      return;
    }
    const currentId = event?._id ?? "create";
    if (initializedEventId.current === currentId) return;
    initializedEventId.current = currentId;
    setScope(event?.campusId ?? campusId ?? "school");
    setTitle(event?.title ?? "");
    setDescription(event?.description ?? "");
    setGradeCodes(event?.gradeCodes ?? []);
    setAudienceMode(event?.gradeCodes?.length ? "specific" : "all");
    setResponsibleId(event?.responsibleId ?? "");
    setTeacherIds(event?.teacherIds ?? []);
    setScheduleMode("keep");
    setScheduleReason("");
    setScheduleBaseline(null);
    setInitialScheduleFingerprint("");
    setStart("");
    setEnd("");
    setRepeat("single");
    setDays([new Date(`${selectedDate}T00:00:00Z`).getUTCDay()]);
    setWeeklyStartTime("");
    setWeeklyEndTime("");
    setWeeklyStartDate("");
    setWeeklyEndDate("");
  }, [campusId, event, open, schoolTimeZone, selectedDate]);

  function showSchedule() {
    if (!event || !editingSchedule) return;
    setScheduleMode("replace");
    if (scheduleBaseline) return;
    setScheduleBaseline({
      futureCount: editingSchedule.futureCount,
      futureFingerprint: editingSchedule.futureFingerprint,
    });
    setScheduleReason("");
    if (!editingSchedule.next) {
      const today = todayInTimeZone(timeZone);
      const date = selectedDate > today ? selectedDate : addCivilDays(today, 1);
      setStart(`${date}T09:00`);
      setEnd(`${date}T10:00`);
      setRepeat("single");
      setDays([new Date(`${date}T00:00:00Z`).getUTCDay()]);
      setWeeklyStartDate(date);
      setWeeklyEndDate(date);
      setWeeklyStartTime("09:00");
      setWeeklyEndTime("10:00");
      return;
    }
    const localStart = utcToLocalDateTime(
      editingSchedule.next.start,
      event.timeZone,
    );
    const localEnd = utcToLocalDateTime(
      editingSchedule.next.end,
      event.timeZone,
    );
    setStart(localStart);
    setEnd(localEnd);
    const nextWeeklyEnd = localEnd.slice(11, 16);
    setWeeklyStartDate(localStart.slice(0, 10));
    setWeeklyStartTime(localStart.slice(11, 16));
    setWeeklyEndTime(nextWeeklyEnd);
    const slots = editingSchedule.weeklySlots;
    if (slots?.length) {
      const nextDays = [...new Set(slots.map((slot) => slot.dayOfWeek))];
      const nextEndDate =
        editingSchedule.recurrenceEndDate ?? localStart.slice(0, 10);
      setWeeklyEndDate(nextEndDate);
      setRepeat("weekly");
      setDays(nextDays);
      setInitialScheduleFingerprint(
        JSON.stringify({
          repeat: "weekly",
          weeklyStartDate: localStart.slice(0, 10),
          weeklyEndDate: nextEndDate,
          weeklyStartTime: localStart.slice(11, 16),
          weeklyEndTime: nextWeeklyEnd,
          days: [...nextDays].sort(),
        }),
      );
    } else {
      setWeeklyEndDate(localEnd.slice(0, 10));
      const nextDays = [
        new Date(`${localStart.slice(0, 10)}T00:00:00Z`).getUTCDay(),
      ];
      setRepeat("single");
      setDays(nextDays);
      setInitialScheduleFingerprint(
        JSON.stringify({
          repeat: "single",
          start: localStart,
          end: localEnd,
        }),
      );
    }
  }

  async function handleSave(submit: React.FormEvent) {
    submit.preventDefault();
    if (
      !responsibleId ||
      !timeZoneReady ||
      (audienceMode === "specific" && !gradeCodes.length) ||
      ((!event || scheduleChanged) && !scheduleDraft) ||
      (event && scheduleChanged && !previewIsCurrent) ||
      (event && scheduleChanged && removedCount > 0 && !scheduleReason.trim())
    )
      return;
    setSaving(true);
    try {
      const details = {
        campusId: selectedCampusId,
        gradeCodes: audienceMode === "specific" ? gradeCodes : undefined,
        title,
        description: description || undefined,
        responsibleId: responsibleId as Id<"users">,
        teacherIds: teacherIds.filter(
          (id) => id !== responsibleId,
        ) as Id<"users">[],
      };
      const schedule = event && !scheduleChanged ? undefined : scheduleDraft!;
      if (event) {
        await update({
          eventId: event._id,
          ...details,
          scheduleEdit: scheduleChanged
            ? {
                mode: "replace",
                schedule: schedule!,
                reason: scheduleReason,
                expectedFutureCount: scheduleBaseline!.futureCount,
                expectedFutureFingerprint: scheduleBaseline!.futureFingerprint,
              }
            : undefined,
        });
        onOpenChange(false);
        toast.success(
          t("eventUpdated"),
          event.campusId !== selectedCampusId
            ? { description: t("eventScopeUpdating") }
            : undefined,
        );
        return;
      }
      const id = await create({
        schoolId,
        ...details,
        schedule: schedule!,
      });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setGradeCodes([]);
      setAudienceMode("all");
      setResponsibleId("");
      setTeacherIds([]);
      toast.success(t("created"));
      if (onCreated) onCreated(id);
      else
        router.push(
          `/${locale}${ROUTES.org.events.detail(params.orgSlug, id)}`,
        );
    } catch (error) {
      let message = t(event ? "eventUpdateFailed" : "createFailed");
      if (error instanceof ConvexError) {
        if (error.data === "OUTSIDE_SCHEDULE_WINDOW")
          message = t("outsideScheduleWindow", {
            start: windowTime(windowStart),
            end: windowTime(windowEnd),
          });
        else if (event && error.data === "EVENT_SCHEDULE_CHANGED")
          message = t("scheduleChangedElsewhere");
        else if (error.data === "EVENT_NO_FUTURE_SESSIONS")
          message = t("noFutureWeeklySessions");
      }
      if (
        error instanceof Error &&
        error.message.includes("INVALID_LOCAL_DATE_TIME")
      )
        message = t("invalidLocalDateTime");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(event ? "editEvent" : "create")}</DialogTitle>
          <DialogDescription>
            {t(event ? "editEventDescription" : "createDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(submit) => void handleSave(submit)}
          className="space-y-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="event-title">
              {t("title")} {requiredMark}
            </Label>
            <Input
              id="event-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="event-description">{t("description")}</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
          </div>
          {canCreateInstitution && (
            <div className="grid gap-2">
              <Label>
                {t("scope")} {requiredMark}
              </Label>
              <Select
                value={scope}
                onValueChange={(value) => {
                  setScope(value);
                  setResponsibleId("");
                  setTeacherIds([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">
                    {t("wholeInstitution")}
                  </SelectItem>
                  {campuses?.map((campus) => (
                    <SelectItem key={campus._id} value={campus._id}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!canCreateInstitution && currentCampus && (
            <p className="text-sm text-muted-foreground">
              {t("scope")}: {currentCampus.name}
            </p>
          )}
          <div className="grid gap-2">
            <Label id={`${audienceId}-label`}>
              {t("audience")} {requiredMark}
            </Label>
            <RadioGroup
              value={audienceMode}
              onValueChange={(value) => {
                setAudienceMode(value as "all" | "specific");
                if (value === "all") setGradeCodes([]);
              }}
              aria-labelledby={`${audienceId}-label`}
            >
              <Label
                htmlFor={`${audienceId}-all`}
                className="flex cursor-pointer items-center gap-2 rounded-md border bg-sidebar p-3 font-normal"
              >
                <RadioGroupItem id={`${audienceId}-all`} value="all" />
                {t("allGradesInScope")}
              </Label>
              <Label
                htmlFor={`${audienceId}-specific`}
                className="flex cursor-pointer items-center gap-2 rounded-md border bg-sidebar p-3 font-normal"
              >
                <RadioGroupItem
                  id={`${audienceId}-specific`}
                  value="specific"
                />
                {t("specificGrades")}
              </Label>
            </RadioGroup>
            {audienceMode === "specific" && (
              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("selectAtLeastOneGrade")}
                </p>
                <GradeCheckboxList
                  grades={grades ?? undefined}
                  value={gradeCodes}
                  onChangeAction={setGradeCodes}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("audienceHelp")}</p>
          </div>
          <div className="grid gap-2">
            <Label id="event-responsible-label">
              {t("responsible")} {requiredMark}
            </Label>
            <TeacherAssignmentPicker
              teachers={teachers}
              value={responsibleId ? [responsibleId] : []}
              onValueChange={(ids) => setResponsibleId(ids[0] ?? "")}
              placeholder={t("selectResponsible")}
              labelId="event-responsible-label"
            />
          </div>
          {teachers && teachers.length > 1 && (
            <div className="grid gap-2">
              <Label id="event-teachers-label">{t("otherTeachers")}</Label>
              <TeacherAssignmentPicker
                teachers={teachers.filter(
                  (teacher) => teacher._id !== responsibleId,
                )}
                value={teacherIds.filter((id) => id !== responsibleId)}
                onValueChange={setTeacherIds}
                multiple
                placeholder={t("selectOtherTeachers")}
                labelId="event-teachers-label"
              />
              <p className="text-xs text-muted-foreground">
                {t("assignedTeachersHelp")}
              </p>
            </div>
          )}
          {event && (
            <div className="space-y-3">
              <div>
                <h3
                  id={`${audienceId}-schedule-mode`}
                  className="text-base font-semibold"
                >
                  {t("schedule")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("eventSchedulingTimeZone", { timeZone })}
                </p>
              </div>
              {event.campusId !== selectedCampusId &&
                event.timeZone !== timeZone &&
                (scheduleMode !== "replace" ||
                  !scheduleChanged ||
                  scheduleValid) && (
                  <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                    {t(
                      scheduleMode === "replace" && scheduleChanged
                        ? "scopeTimeZoneReplaceNotice"
                        : "scopeTimeZoneChangeNotice",
                    )}
                  </p>
                )}
              {editingSchedule && (
                <p className="text-sm text-muted-foreground">
                  {t("scheduledFutureCount", {
                    count: editingSchedule.futureCount,
                  })}
                </p>
              )}
              {editingSchedule &&
              (editingSchedule.futureCount > 0 || !event.isRecurring) ? (
                <RadioGroup
                  value={scheduleMode}
                  onValueChange={(value) =>
                    value === "replace"
                      ? showSchedule()
                      : setScheduleMode("keep")
                  }
                  aria-labelledby={`${audienceId}-schedule-mode`}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <Label className="flex cursor-pointer items-center gap-2 rounded-md border bg-sidebar p-3 font-normal">
                    <RadioGroupItem value="keep" />
                    {t("keepSchedule")}
                  </Label>
                  <Label className="flex cursor-pointer items-center gap-2 rounded-md border bg-sidebar p-3 font-normal">
                    <RadioGroupItem value="replace" />
                    {t(
                      editingSchedule.futureCount > 0
                        ? "editSchedule"
                        : "scheduleAnotherDate",
                    )}
                  </Label>
                </RadioGroup>
              ) : editingSchedule ? (
                <p className="text-sm text-muted-foreground">
                  {t("createNewEventForDate")}
                </p>
              ) : null}
              {scheduleMode === "replace" &&
                scheduleChanged &&
                scheduleBaseline &&
                previewIsCurrent &&
                (removedCount > 0 || addedCount > 0) && (
                  <p
                    role="status"
                    className={
                      removedCount > 0
                        ? "rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground"
                        : "rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground"
                    }
                  >
                    {removedCount > 0
                      ? addedCount > 0
                        ? t("replaceFutureNotice", {
                            oldCount: removedCount,
                            newCount: addedCount,
                          })
                        : t("removeFutureNotice", { count: removedCount })
                      : t("newDatesNotice", { count: addedCount })}
                  </p>
                )}
            </div>
          )}
          {(!event || scheduleMode !== "keep") && (
            <div className="grid gap-2">
              {!event && (
                <Label id={`${audienceId}-schedule`}>
                  {t("schedule")} {requiredMark}
                </Label>
              )}
              {event?.isRecurring ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {t("weekly")}
                </p>
              ) : (
                <Select
                  value={repeat}
                  onValueChange={(value) =>
                    setRepeat(value as "single" | "weekly")
                  }
                >
                  <SelectTrigger
                    aria-labelledby={
                      event ? undefined : `${audienceId}-schedule`
                    }
                    aria-label={event ? t("schedule") : undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">{t("single")}</SelectItem>
                    <SelectItem value="weekly">{t("weekly")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {timeZoneReady && !event && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    scope === "school"
                      ? "institutionSchedulingTimeZone"
                      : "campusSchedulingTimeZone",
                    { timeZone },
                  )}
                </p>
              )}
            </div>
          )}
          {(!event || scheduleMode !== "keep") &&
            (repeat === "single" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="event-start">
                    {t("start")} {requiredMark}
                  </Label>
                  <Input
                    id="event-start"
                    type="datetime-local"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="event-end">
                    {t("end")} {requiredMark}
                  </Label>
                  <Input
                    id="event-end"
                    type="datetime-local"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    required
                  />
                </div>
                {singleScheduleAlert && (
                  <p
                    className="text-sm text-destructive sm:col-span-2"
                    role="alert"
                  >
                    {singleScheduleAlert === "outsideScheduleWindow"
                      ? t("outsideScheduleWindow", {
                          start: windowTime(windowStart),
                          end: windowTime(windowEnd),
                        })
                      : t(singleScheduleAlert)}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Label>
                  {t("repeatOn")} {requiredMark}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={days.includes(day) ? "default" : "outline"}
                      aria-pressed={days.includes(day)}
                      onClick={() =>
                        setDays((current) =>
                          current.includes(day)
                            ? current.filter((item) => item !== day)
                            : [...current, day],
                        )
                      }
                    >
                      {t(`day${day}`)}
                    </Button>
                  ))}
                </div>
                {weeklyScheduleAlert === "selectWeeklyDay" && (
                  <p className="text-sm text-destructive" role="alert">
                    {t("selectWeeklyDay")}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="event-weekly-start-time">
                      {t("startTime")} {requiredMark}
                    </Label>
                    <Input
                      id="event-weekly-start-time"
                      type="time"
                      value={weeklyStartTime}
                      onChange={(event) =>
                        setWeeklyStartTime(event.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="event-weekly-end-time">
                      {t("endTime")} {requiredMark}
                    </Label>
                    <Input
                      id="event-weekly-end-time"
                      type="time"
                      value={weeklyEndTime}
                      onChange={(event) => setWeeklyEndTime(event.target.value)}
                      required
                    />
                  </div>
                </div>
                {(weeklyScheduleAlert === "outsideScheduleWindow" ||
                  weeklyScheduleAlert === "endTimeMustFollowStart") && (
                  <p className="text-sm text-destructive" role="alert">
                    {weeklyScheduleAlert === "outsideScheduleWindow"
                      ? t("outsideScheduleWindow", {
                          start: windowTime(windowStart),
                          end: windowTime(windowEnd),
                        })
                      : t("endTimeMustFollowStart")}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="event-repeat-start">
                      {t("firstDate")} {requiredMark}
                    </Label>
                    <Input
                      id="event-repeat-start"
                      type="date"
                      value={weeklyStartDate}
                      onChange={(event) =>
                        setWeeklyStartDate(event.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="event-repeat-end">
                      {t("lastDate")} {requiredMark}
                    </Label>
                    <Input
                      id="event-repeat-end"
                      type="date"
                      value={weeklyEndDate}
                      onChange={(event) => setWeeklyEndDate(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("repeatRangeHelp")}
                </p>
                {!invalidWeeklyRange && firstScheduledDate && (
                  <p className="text-sm text-muted-foreground">
                    {!event &&
                      firstDate &&
                      firstScheduledDate !== firstDate &&
                      `${t("pastWeeklyDatesSkipped")} `}
                    {t("firstWeeklySession", {
                      date: formatWeeklyDate(firstScheduledDate, locale),
                    })}
                  </p>
                )}
                {weeklyScheduleAlert &&
                  weeklyScheduleAlert !== "selectWeeklyDay" &&
                  weeklyScheduleAlert !== "outsideScheduleWindow" &&
                  weeklyScheduleAlert !== "endTimeMustFollowStart" && (
                    <p className="text-sm text-destructive" role="alert">
                      {weeklyScheduleAlert === "weeklyRangeTooLong"
                        ? t("weeklyRangeTooLong", { weeks: MAX_EVENT_WEEKS })
                        : t(weeklyScheduleAlert)}
                    </p>
                  )}
              </div>
            ))}
          {(!event || scheduleMode !== "keep") &&
            scheduleValid &&
            timeZoneReady &&
            !scheduleDraft && (
              <p className="text-sm text-destructive" role="alert">
                {t("invalidLocalDateTime")}
              </p>
            )}
          {event &&
            scheduleChanged &&
            changePreview &&
            "error" in changePreview && (
              <p className="text-sm text-destructive" role="alert">
                {changePreview.error === "INVALID_LOCAL_DATE_TIME"
                  ? t("invalidLocalDateTime")
                  : changePreview.error === "OUTSIDE_SCHEDULE_WINDOW"
                    ? t("outsideScheduleWindow", {
                        start: windowTime(windowStart),
                        end: windowTime(windowEnd),
                      })
                    : changePreview.error === "EVENT_NO_FUTURE_SESSIONS"
                      ? t("noFutureWeeklySessions")
                      : t("eventUpdateFailed")}
              </p>
            )}
          {event &&
            scheduleChanged &&
            changePreview &&
            !("error" in changePreview) &&
            !previewIsCurrent && (
              <p className="text-sm text-destructive" role="alert">
                {t("scheduleChangedElsewhere")}
              </p>
            )}
          {(!event || scheduleMode !== "keep") &&
            scheduleValid &&
            conflicts &&
            conflicts.length > 0 && (
              <EventOverlapNotice count={conflicts.length} />
            )}
          {event &&
            scheduleMode === "replace" &&
            scheduleChanged &&
            removedCount > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="event-schedule-reason">
                  {t("scheduleChangeReason")} {requiredMark}
                </Label>
                <Textarea
                  id="event-schedule-reason"
                  value={scheduleReason}
                  onChange={(change) => setScheduleReason(change.target.value)}
                  maxLength={500}
                  required
                />
              </div>
            )}
          {event &&
            (event.campusId !== selectedCampusId ||
              JSON.stringify([...(event.gradeCodes ?? [])].sort()) !==
                JSON.stringify(
                  [...(audienceMode === "specific" ? gradeCodes : [])].sort(),
                )) && (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
                {t("audienceChangeNotice")}
              </p>
            )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                saving ||
                !responsibleId ||
                !timeZoneReady ||
                ((!event || scheduleChanged) && !scheduleDraft) ||
                (event && scheduleChanged && !previewIsCurrent) ||
                (audienceMode === "specific" && !gradeCodes.length) ||
                (event && activeRoom !== false) ||
                (event && !editingSchedule) ||
                (event &&
                  scheduleChanged &&
                  removedCount > 0 &&
                  !scheduleReason.trim())
              }
            >
              {saving
                ? t("saving")
                : event && scheduleChanged && previewIsCurrent
                  ? scheduleBaseline!.futureCount > 0
                    ? t("saveScheduleChanges")
                    : t("scheduleDatesAction", { count: addedCount })
                  : t(event ? "save" : "create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
