"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { TZDate } from "@date-fns/tz";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EventOccurrenceDialog } from "@/components/calendar/dialog/calendar-occurrence-dialog";
import { CalendarEventFormDialog } from "@/components/calendar/dialog/calendar-event-form-dialog";
import type { InstitutionalCalendarEvent } from "@/components/calendar/calendar-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentMinute, useCurrentMinute } from "@/hooks/use-current-minute";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { EventPastSessionsPanel } from "@/components/events/event-past-sessions-panel";
import {
  NextClassPanel,
  NextClassPreview,
} from "@/components/schedule/next-class-panel";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/navigation/routes";

export function EventDetail({
  eventId,
  orgSlug,
  focusRecordings = false,
  recordingId,
  onDeleted,
}: {
  eventId: Id<"events">;
  orgSlug: string;
  focusRecordings?: boolean;
  recordingId?: Id<"recordings"> | null;
  onDeleted?: () => void;
}) {
  const t = useTranslations("events");
  const locale = useLocale();
  const recordingsRequested = focusRecordings;
  const { access } = useStaffAccess();
  const event = useQuery(api.events.get, { eventId });
  const activeRoom = useQuery(
    api.events.hasActiveRoom,
    event ? { eventId } : "skip",
  );
  const grades = useQuery(
    api.grades.list,
    event ? { schoolId: event.schoolId } : "skip",
  );
  const now = useCurrentMinute();
  const [historyCutoff, setHistoryCutoff] = useState(() => ({
    eventId,
    now: getCurrentMinute(),
  }));
  const historyNow =
    historyCutoff.eventId === eventId ? historyCutoff.now : now;
  const [dismissedRecordingId, setDismissedRecordingId] =
    useState<Id<"recordings"> | null>(null);
  const lastNext = useRef<{
    eventId: Id<"events">;
    id: Id<"eventOccurrences">;
    end: number;
    status: "scheduled" | "active" | "completed" | "cancelled";
  } | null>(null);
  const nextResult = useQuery(
    api.events.nextOccurrence,
    event ? { eventId, now } : "skip",
  );
  const next = useRetainedQueryResult(nextResult, eventId);
  const nextRoomStatus = useQuery(
    api.eventRoom.getSessionStatus,
    next
      ? {
          roomName: next.roomName,
          now: Math.floor(now / 60_000) * 60_000,
        }
      : "skip",
  );
  const recordingTarget = useQuery(
    api.recordings.getEventRecordingTarget,
    event && recordingId && recordingId !== dismissedRecordingId
      ? { eventId, recordingId }
      : "skip",
  );
  /* eslint-disable react-hooks/set-state-in-effect -- Preserve the history pagination boundary when a live session finishes. */
  useEffect(() => {
    if (historyCutoff.eventId !== eventId) {
      lastNext.current = null;
      setHistoryCutoff({ eventId, now });
      return;
    }
    const previous = lastNext.current;
    if (
      previous?.eventId === eventId &&
      ((previous.end <= now && previous.end > historyCutoff.now) ||
        previous.id !== next?._id ||
        (previous.status !== "completed" && next?.status === "completed"))
    )
      setHistoryCutoff({ eventId, now });
    lastNext.current = next
      ? { eventId, id: next._id, end: next.end, status: next.status }
      : null;
  }, [eventId, historyCutoff, next, now]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const upcoming = usePaginatedQuery(
    api.events.listOccurrences,
    event ? { eventId, category: "upcoming", now: historyNow } : "skip",
    { initialNumItems: 8 },
  );
  const past = usePaginatedQuery(
    api.events.listOccurrences,
    event ? { eventId, category: "past", now: historyNow } : "skip",
    { initialNumItems: 30 },
  );
  const removeEvent = useMutation(api.events.remove);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<InstitutionalCalendarEvent | null>(
    null,
  );
  const [selectedRecording, setSelectedRecording] = useState<{
    _id: Id<"eventOccurrences">;
    start: number;
    end: number;
  } | null>(null);
  const loadedEventId = event?._id;

  useEffect(() => {
    if (
      recordingsRequested &&
      loadedEventId &&
      past.status !== "LoadingFirstPage"
    )
      document
        .getElementById("event-past-sessions")
        ?.scrollIntoView?.({ block: "start" });
  }, [recordingsRequested, loadedEventId, past.status]);

  if (event === undefined)
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (!event)
    return <p className="p-6 text-muted-foreground">{t("notFound")}</p>;

  const canModify = event.canEdit && activeRoom === false;
  const nextRoomAction =
    nextRoomStatus?.status === "active"
      ? t("enterRoom")
      : nextRoomStatus?.canReopen
        ? t("reopen")
        : nextRoomStatus?.canStart
          ? t("startRoom")
          : null;
  const notificationRecording =
    recordingId !== dismissedRecordingId ? recordingTarget : null;
  const playingRecording = selectedRecording ?? notificationRecording;

  const laterOccurrences = upcoming.results.filter(
    (row) => row._id !== next?._id && row.start >= now,
  );
  const previewOccurrences = laterOccurrences.slice(0, 3);
  const gradeLabel = event.gradeCodes
    ?.map((code) => grades?.find((grade) => grade.code === code)?.name ?? code)
    .join(", ");
  const audienceLabel =
    gradeLabel || t(event.campusId ? "wholeCampus" : "wholeInstitution");

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: event.timeZone,
    }).format(timestamp);
  const formatTime = (timestamp: number) =>
    new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: event.timeZone,
    }).format(timestamp);
  const formatDateOnly = (timestamp: number) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: event.timeZone,
    }).format(timestamp);
  function selectOccurrence(
    row: (typeof upcoming.results)[number] | NonNullable<typeof next>,
  ) {
    if (!event) return;
    setSelected({
      kind: "event",
      id: row._id,
      occurrenceId: row._id,
      eventId: row.eventId,
      schoolId: event.schoolId,
      title: event.title,
      description: event.description,
      start: new TZDate(row.start, event.timeZone),
      end: new TZDate(row.end, event.timeZone),
      actualStart: row.start,
      actualEnd: row.end,
      timeZone: event.timeZone,
      color: "amber",
      status: row.status,
      isLive: row.status === "active",
      sessionType: "live",
      roomName: row.roomName,
      gradeCodes: event.gradeCodes,
      gradeLabel,
      teacherIds: [event.responsibleId, ...event.teacherIds],
      responsibleName: event.responsibleName,
      campusId: event.campusId,
      campusName: event.campusName,
      canManage: event.canManage,
      canEdit: event.canEdit,
      canCancelOccurrence: event.canCancelOccurrence,
      cancellationReason: row.cancellationReason,
    });
  }
  async function handleDelete() {
    setDeleting(true);
    try {
      await removeEvent({ eventId });
      toast.success(t("eventDeleted"));
      onDeleted?.();
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4 p-2">
      <header className="@container space-y-4 rounded-2xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pr-12">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Image
              src="/event-calendar-star.svg"
              alt=""
              width={50}
              height={50}
              aria-hidden="true"
              className="size-14 shrink-0 object-contain sm:size-16"
            />
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-bold leading-tight sm:text-3xl @5xl:text-4xl">
                {event.title}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-10 border-0 p-0 shadow-none hover:bg-transparent"
            >
              <Link
                href={ROUTES.org.events.chat(orgSlug, eventId)}
                aria-label={t("chat")}
                title={t("chat")}
              >
                <Image
                  src="/chat-icon.svg"
                  alt=""
                  width={36}
                  height={36}
                  aria-hidden="true"
                  className="size-9 object-contain"
                />
              </Link>
            </Button>
            {canModify && (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil aria-hidden="true" />
                  {t("editEvent")}
                </Button>
                <Button
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 aria-hidden="true" />
                  {t("deleteEvent")}
                </Button>
              </>
            )}
          </div>
        </div>
        {event.canEdit && activeRoom && (
          <p className="text-sm text-muted-foreground">
            {t("activeRoomEditingBlocked")}
          </p>
        )}
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-primary/15 pt-4 text-sm @2xl:grid-cols-2 @5xl:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("scope")}</dt>
            <dd className="break-words font-medium">
              {event.campusName ?? t("scopeInstitution")}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("audience")}</dt>
            <dd className="break-words font-medium">{audienceLabel}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("responsible")}</dt>
            <dd className="break-words font-medium">{event.responsibleName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("schedule")}</dt>
            <dd className="break-words font-medium">
              {t(event.isRecurring ? "weekly" : "single")}
              <span className="font-normal text-muted-foreground">
                {" · "}
                {event.timeZone}
              </span>
            </dd>
          </div>
        </dl>
        {event.description && (
          <p className="whitespace-pre-wrap break-words border-t border-primary/15 pt-4 text-sm text-muted-foreground">
            {event.description}
          </p>
        )}
      </header>

      <div className="@container space-y-4">
        {next != null && (
          <NextClassPanel
            className="xl:p-4"
            nextClass={{
              id: next._id,
              title: `${formatDate(next.start)}`,
              start: next.start,
              end: next.end,
              status: next.status,
              isLive: next.status === "active",
              sessionType: "live",
            }}
            heading={t("nextSession")}
            showProviderBadge={false}
            layout={previewOccurrences.length ? "split" : "stacked"}
            action={
              nextRoomAction ? (
                <Button
                  asChild
                  className="mt-3 rounded-full bg-info px-6 font-semibold text-info-foreground hover:bg-info/90"
                >
                  <Link
                    href={`/${orgSlug}/classroom/${encodeURIComponent(next.roomName)}`}
                  >
                    {nextRoomAction}
                  </Link>
                </Button>
              ) : undefined
            }
          >
            <NextClassPreview
              label={t("upcoming")}
              items={previewOccurrences.map((row) => ({
                id: row._id,
                title: `${formatDateOnly(row.start)}, ${formatTime(row.start)}`,
                sessionType: "live",
              }))}
              showProviderBadge={false}
              className="mt-4 md:mt-0 md:h-full md:max-w-none xl:mt-0"
              onSelect={(item) => {
                const row = previewOccurrences.find(
                  (entry) => entry._id === item.id,
                );
                if (row) selectOccurrence(row);
              }}
            />
          </NextClassPanel>
        )}

        {next === null &&
        past.results.length === 0 &&
        past.status === "Exhausted" ? (
          <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
            {t("noSessions")}
          </p>
        ) : (
          (past.results.length > 0 || past.status === "CanLoadMore") && (
            <div id="event-past-sessions" className="scroll-mt-24">
              <EventPastSessionsPanel
                sessions={past.results}
                timeZone={event.timeZone}
                onWatchRecording={setSelectedRecording}
                canLoadMore={past.status === "CanLoadMore"}
                onLoadMore={() => past.loadMore(30)}
              />
            </div>
          )
        )}
      </div>
      <EventOccurrenceDialog
        event={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        displayTimeZone={event.timeZone}
        showViewEvent={false}
        onViewEvent={(_eventId, target) => {
          if (target === "recordings" && selected)
            setSelectedRecording({
              _id: selected.occurrenceId,
              start: selected.actualStart,
              end: selected.actualEnd,
            });
          setSelected(null);
        }}
      />
      {canModify && (
        <CalendarEventFormDialog
          event={event}
          schoolId={event.schoolId}
          campusId={event.campusId}
          schoolTimeZone={event.timeZone}
          selectedDate={new Date(now).toISOString().slice(0, 10)}
          canCreateInstitution={access?.canManageInstitution ?? false}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteEvent")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteEventDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || activeRoom !== false}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(click) => {
                click.preventDefault();
                void handleDelete();
              }}
            >
              {t("deleteEvent")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {playingRecording && (
        <RecordingPlayerModal
          occurrenceId={playingRecording._id}
          title={event.title}
          secondaryLabel={event.responsibleName}
          scheduledStart={playingRecording.start}
          scheduledEnd={playingRecording.end}
          timeZone={event.timeZone}
          recordings={
            selectedRecording || !notificationRecording
              ? undefined
              : [notificationRecording.recording]
          }
          open
          onOpenChange={(open) => {
            if (!open) {
              setSelectedRecording(null);
              setDismissedRecordingId(recordingId ?? null);
            }
          }}
        />
      )}
    </div>
  );
}
