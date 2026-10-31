"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Building2,
  Loader2,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useCalendarContext } from "../calendar-context";
import type { InstitutionalCalendarEvent } from "../calendar-types";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { ROUTES } from "@/lib/navigation/routes";
import {
  CalendarCancellationSummary,
  CalendarOccurrenceSchedule,
} from "./calendar-occurrence-schedule";

const requiredMark = (
  <span
    aria-hidden="true"
    data-slot="required-field-mark"
    className="text-destructive before:content-['*']"
  />
);

export function EventOccurrenceDialog({
  event,
  open,
  onOpenChange,
  displayTimeZone,
  onViewEvent,
  showViewEvent = true,
}: {
  event: InstitutionalCalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayTimeZone: string;
  onViewEvent?: (eventId: Id<"events">, target?: "recordings") => void;
  showViewEvent?: boolean;
}) {
  const t = useTranslations("events");
  const tSchedule = useTranslations("schedule");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const now = useCurrentMinute();
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const cancel = useMutation(api.events.cancelOccurrence);
  const cancelFuture = useMutation(api.events.cancelFuture);
  const reopen = useMutation(api.eventRoom.reopen);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelScope, setCancelScope] = useState<"one" | "future">("one");
  const [saving, setSaving] = useState(false);
  const eventId = event?.id;
  const activeRoom = useQuery(
    api.events.hasActiveRoom,
    open && event ? { eventId: event.eventId } : "skip",
  );
  if (activeRoom && cancelDialogOpen) setCancelDialogOpen(false);
  if (!open && (cancelDialogOpen || reopenDialogOpen)) {
    setCancelDialogOpen(false);
    setReopenDialogOpen(false);
  }
  const eventStart = event?.actualStart;
  const roomStatus = useQuery(
    api.eventRoom.getSessionStatus,
    open && event?.roomName
      ? { roomName: event.roomName, now: Math.floor(now / 60_000) * 60_000 }
      : "skip",
  );
  const recordings = useQuery(
    api.recordings.getByEventOccurrence,
    open && event && roomStatus?.status === "completed"
      ? { occurrenceId: event.occurrenceId }
      : "skip",
  );

  const eventScope = `${eventId ?? ""}:${eventStart ?? ""}`;
  const [previousEventScope, setPreviousEventScope] = useState(eventScope);
  if (previousEventScope !== eventScope) {
    setPreviousEventScope(eventScope);
    setCancelDialogOpen(false);
    setReason("");
    setCancelScope("one");
  }

  if (!event) return null;
  const isFuture = event.status === "scheduled" && event.actualStart > now;
  const canStart = roomStatus?.canStart === true;
  const canReopen = roomStatus?.canReopen === true;
  const isLive = roomStatus?.status === "active";
  const occurrenceStatus = roomStatus?.status ?? event.status;
  const canCancel =
    event.canCancelOccurrence && isFuture && activeRoom === false;
  const roomAction = isLive
    ? t("enterRoom")
    : canReopen
      ? t("reopen")
      : canStart
        ? t("startRoom")
        : null;
  const classroomHref = `/${locale}/${params.orgSlug}/classroom/${encodeURIComponent(event.roomName)}`;
  async function handleReopen() {
    if (!event) return;
    setSaving(true);
    try {
      await reopen({ roomName: event.roomName });
      setReopenDialogOpen(false);
      onOpenChange(false);
      router.push(classroomHref);
    } catch {
      toast.error(t("reopenError"));
    } finally {
      setSaving(false);
    }
  }
  async function handleCancel() {
    if (!event || !reason.trim()) return;
    setSaving(true);
    try {
      if (cancelScope === "future")
        await cancelFuture({ occurrenceId: event.occurrenceId, reason });
      else await cancel({ occurrenceId: event.occurrenceId, reason });
      toast.success(t("cancellationSaved"));
      setCancelDialogOpen(false);
      onOpenChange(false);
    } catch {
      toast.error(t("cancelFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90vh] max-w-xl gap-0 overflow-x-hidden overflow-y-auto p-0"
          showCloseButton={false}
        >
          <DialogHeader className="relative flex flex-row items-start gap-3 space-y-0 overflow-hidden border-b border-primary/20 bg-gradient-to-br from-primary/15 via-background to-secondary/15 px-6 py-4 pr-14 text-left">
            <Image
              src="/event-calendar-star.svg"
              alt=""
              width={48}
              height={48}
              aria-hidden="true"
              className="pointer-events-none size-12 shrink-0 select-none object-contain"
            />
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-words text-xl font-bold leading-tight sm:text-2xl">
                {showViewEvent ? (
                  <Link
                    href={`/${locale}${ROUTES.org.events.detail(params.orgSlug, event.eventId)}`}
                    title={t("viewEvent")}
                    className="group/event-link inline-flex max-w-full cursor-pointer items-start gap-1.5 rounded-sm transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={(clickEvent) => {
                      if (onViewEvent) {
                        clickEvent.preventDefault();
                        onOpenChange(false);
                        onViewEvent(event.eventId);
                      }
                    }}
                  >
                    <span className="min-w-0 decoration-primary decoration-2 underline-offset-4 group-hover/event-link:underline group-focus-visible/event-link:underline">
                      {event.title}
                    </span>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 -translate-x-1 opacity-0 transition-all group-hover/event-link:translate-x-0 group-hover/event-link:opacity-100 group-focus-visible/event-link:translate-x-0 group-focus-visible/event-link:opacity-100" />
                  </Link>
                ) : (
                  event.title
                )}
              </DialogTitle>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {tCommon("with")} {event.responsibleName}
              </p>
              {(isLive || occurrenceStatus !== "scheduled") && (
                <Badge
                  variant={
                    isLive || occurrenceStatus === "cancelled"
                      ? "destructive"
                      : "secondary"
                  }
                  className={isLive ? "mt-2 animate-pulse" : "mt-2"}
                >
                  {isLive ? tCommon("live") : t(occurrenceStatus)}
                </Badge>
              )}
            </div>
            <DialogDescription className="sr-only">
              {t("schedule")}
            </DialogDescription>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 text-muted-foreground hover:bg-background/70 hover:text-foreground"
                aria-label={t("closeExplorer")}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </DialogClose>
          </DialogHeader>
          <div className="w-full min-w-0 space-y-5 px-6 pb-6 pt-5">
            <CalendarOccurrenceSchedule
              start={event.actualStart}
              end={event.actualEnd}
              locale={locale}
              timeZone={displayTimeZone}
              minutesLabel={tSchedule("minutes")}
              showTimeZone
              details={[
                {
                  label: t("scope"),
                  value: event.campusName ?? t("scopeInstitution"),
                  icon: Building2,
                },
                {
                  label: t("audience"),
                  value:
                    event.gradeLabel ??
                    t(event.campusId ? "wholeCampus" : "wholeInstitution"),
                  icon: UsersRound,
                },
              ]}
            />
            {event.description && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {event.description}
              </p>
            )}
            {event.status === "cancelled" && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {t("cancelled")}: {event.cancellationReason}
              </p>
            )}
            {isFuture &&
              activeRoom &&
              (event.canEdit || event.canCancelOccurrence) && (
                <p className="text-sm text-muted-foreground">
                  {t("activeRoomEditingBlocked")}
                </p>
              )}
            <DialogFooter className="gap-2 sm:flex-row sm:items-center sm:justify-between">
              {canCancel && (
                <Button
                  variant="outline"
                  className="h-11 w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                  onClick={() => {
                    setReason("");
                    setCancelScope("one");
                    setCancelDialogOpen(true);
                  }}
                >
                  <XCircle className="size-4" aria-hidden="true" />
                  {t("cancelDate")}
                </Button>
              )}
              {roomAction &&
                (canReopen && !isLive ? (
                  <Button
                    className="h-11 w-full sm:ml-auto sm:w-auto"
                    onClick={() => setReopenDialogOpen(true)}
                  >
                    {roomAction}
                  </Button>
                ) : (
                  <Button
                    asChild
                    className={
                      isLive
                        ? "h-11 w-full bg-success text-success-foreground hover:bg-success/90 sm:ml-auto sm:w-auto"
                        : "h-11 w-full sm:ml-auto sm:w-auto"
                    }
                  >
                    <Link href={classroomHref}>{roomAction}</Link>
                  </Button>
                ))}
              {!roomAction &&
                recordings?.some((recording) => Boolean(recording.url)) &&
                (onViewEvent ? (
                  <Button
                    className="h-11 w-full sm:w-auto"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      onViewEvent(event.eventId, "recordings");
                    }}
                  >
                    {t("recordings")}
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant="outline"
                    className="h-11 w-full sm:w-auto"
                  >
                    <Link
                      href={`/${locale}${ROUTES.org.events.recordings(params.orgSlug, event.eventId)}`}
                    >
                      {t("recordings")}
                    </Link>
                  </Button>
                ))}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reopenTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("reopenDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(actionEvent) => {
                actionEvent.preventDefault();
                void handleReopen();
              }}
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("confirmReopen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelDate")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription asChild>
            <div>
              <CalendarCancellationSummary
                title={event.title}
                start={event.actualStart}
                end={event.actualEnd}
                locale={locale}
                timeZone={displayTimeZone}
              />
            </div>
          </AlertDialogDescription>
          {event.canEdit && (
            <div className="space-y-3">
              <Label>{tSchedule("cancellationScope")}</Label>
              <RadioGroup
                value={cancelScope}
                onValueChange={(value) =>
                  setCancelScope(value as "one" | "future")
                }
                className="gap-2"
              >
                <Label className="cursor-pointer items-start rounded-md border p-3 font-normal">
                  <RadioGroupItem value="one" className="mt-0.5" />
                  <span>
                    <span className="block font-medium">
                      {t("cancelThisDate")}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("cancelDateDescription")}
                    </span>
                  </span>
                </Label>
                <Label className="cursor-pointer items-start rounded-md border p-3 font-normal">
                  <RadioGroupItem value="future" className="mt-0.5" />
                  <span>
                    <span className="block font-medium">
                      {t("cancelFuture")}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("cancelFutureDescription")}
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="event-cancel-reason">
              {t("reason")} {requiredMark}
            </Label>
            <Textarea
              id="event-cancel-reason"
              maxLength={500}
              value={reason}
              onChange={(change) => setReason(change.target.value)}
              placeholder={t("cancellationReasonPlaceholder")}
              aria-invalid={cancelDialogOpen && reason.trim().length === 0}
            />
            <p className="text-xs text-muted-foreground">
              {t("cancellationReasonHelp")}
            </p>
          </div>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row">
            <AlertDialogCancel className="w-full sm:w-auto" disabled={saving}>
              {t("keepDate")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={saving || !reason.trim()}
              onClick={() => void handleCancel()}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t(
                cancelScope === "future" ? "confirmCancelFuture" : "cancelDate",
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CalendarOccurrenceDialog({
  onViewEvent,
}: {
  onViewEvent?: (eventId: Id<"events">, target?: "recordings") => void;
}) {
  const {
    selectedEvent,
    manageEventDialogOpen,
    setManageEventDialogOpen,
    displayTimeZone,
  } = useCalendarContext();
  return (
    <EventOccurrenceDialog
      event={selectedEvent?.kind === "event" ? selectedEvent : null}
      open={manageEventDialogOpen && selectedEvent?.kind === "event"}
      onOpenChange={setManageEventDialogOpen}
      displayTimeZone={displayTimeZone}
      onViewEvent={onViewEvent}
    />
  );
}
