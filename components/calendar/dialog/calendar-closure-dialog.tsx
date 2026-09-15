"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { getErrorMessage, parseConvexError } from "@/lib/error-utils";

type CalendarClosureDialogProps = {
  schoolId: Id<"schools">;
  campusId?: Id<"campuses">;
  scopeLabel: string;
  schedulingTimeZone: string;
  selectedDate: string;
};

export default function CalendarClosureDialog({
  schoolId,
  campusId,
  scopeLabel,
  schedulingTimeZone,
  selectedDate,
}: CalendarClosureDialogProps) {
  const t = useTranslations("calendar.closures");
  const tRoot = useTranslations();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [localDate, setLocalDate] = useState(selectedDate);
  const [reason, setReason] = useState("");
  const [previewNow, setPreviewNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const createClosure = useMutation(api.calendarClosures.create);
  const previewArgs =
    open && localDate
      ? {
          schoolId,
          campusId,
          localDate,
          isAllDay: true,
          now: previewNow,
        }
      : "skip";
  const preview = useQuery(api.calendarClosures.preview, previewArgs);

  useEffect(() => {
    if (!open) return;
    setLocalDate(selectedDate);
    setPreviewNow(Date.now());
  }, [open, selectedDate]);

  const affectedSchedules = preview
    ? [...preview.contained, ...preview.partial].sort(
        (first, second) => first.start - second.start,
      )
    : [];
  const selectedCount = affectedSchedules.length;
  const description = t("description", { scope: scopeLabel });
  const selectedDateLabel = localDate
    ? new Date(`${localDate}T00:00:00Z`).toLocaleDateString(locale, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";
  const candidateTime = (start: number, end: number) =>
    `${new Date(start).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: schedulingTimeZone,
    })}–${new Date(end).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: schedulingTimeZone,
    })}`;

  const canSubmit = Boolean(
    reason.trim() && preview && !preview.isTruncated && selectedCount > 0,
  );

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createClosure({
        schoolId,
        campusId,
        localDate,
        isAllDay: true,
        reason: reason.trim(),
        selectedPartialScheduleIds:
          preview?.partial.map((item) => item.scheduleId) ?? [],
      });
      toast.success(t("created"));
      setConfirmOpen(false);
      setOpen(false);
      setReason("");
    } catch (error) {
      const parsed = parseConvexError(error);
      toast.error(
        parsed
          ? getErrorMessage(parsed, tRoot, locale)
          : tRoot("errors.operationFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const body = (
    <div className="space-y-5 px-4 py-4 sm:px-6">
      <div className="rounded-lg border bg-muted/35 p-3 text-sm">
        <p className="font-medium">{scopeLabel}</p>
        <p className="mt-1 text-muted-foreground">
          {t("timeZone", { timeZone: schedulingTimeZone })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="calendar-closure-date">
          {t("date")}{" "}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only">{t("required")}</span>
        </Label>
        <Input
          id="calendar-closure-date"
          type="date"
          value={localDate}
          onChange={(event) => setLocalDate(event.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="calendar-closure-reason">
          {t("reason")}{" "}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only">{t("required")}</span>
        </Label>
        <Textarea
          id="calendar-closure-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("reasonPlaceholder")}
          maxLength={500}
          rows={3}
          required
        />
      </div>

      <section className="space-y-3" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{t("preview")}</h3>
          {preview && (
            <Badge variant="secondary">
              {t("selectedCount", { count: selectedCount })}
            </Badge>
          )}
        </div>
        {preview === undefined ? (
          <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("loadingPreview")}
          </div>
        ) : preview.isTruncated ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t("tooManyClasses")}
          </p>
        ) : (
          <>
            {affectedSchedules.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("includedTitle")}</p>
                <div className="space-y-1 rounded-lg border p-2 md:max-h-32 md:overflow-y-auto">
                  {affectedSchedules.map((item) => (
                    <div
                      key={item.scheduleId}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
                    >
                      <span className="truncate">{item.className}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {candidateTime(item.start, item.end)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {affectedSchedules.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("emptyPreview")}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );

  const footer = (
    <>
      <Button variant="outline" onClick={() => setOpen(false)}>
        {t("cancel")}
      </Button>
      <Button disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
        <CalendarDays className="size-4" />
        {t("review")}
      </Button>
    </>
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="shrink-0"
        aria-label={t("action")}
        title={t("action")}
      >
        <CalendarDays className="size-4" />
        <span className="hidden xl:inline">{t("action")}</span>
      </Button>

      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[92svh] min-h-0 gap-0 rounded-t-2xl p-0"
          >
            <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-muted-foreground/30" />
            <SheetHeader className="shrink-0 border-b pr-12 text-left">
              <SheetTitle>{t("title")}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {body}
            </div>
            <SheetFooter className="shrink-0 flex-row border-t bg-background">
              {footer}
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex max-h-[90svh] min-h-0 max-w-2xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {body}
            </div>
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              {footer}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <AlertDialogHeader className="items-center bg-warning/10 px-6 py-6 text-center sm:text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-warning/20 text-warning-foreground">
              <CalendarDays className="size-6" />
            </div>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDescription", {
                count: selectedCount,
                date: selectedDateLabel,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 px-6 py-5">
            <div className="rounded-lg border bg-muted/35 p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("confirmScope")}
              </p>
              <p className="mt-1 font-medium">{scopeLabel}</p>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("confirmReason")}
              </p>
              <p className="mt-1 text-foreground">{reason.trim()}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t("confirmNote")}</p>
          </div>
          <AlertDialogFooter className="flex-col-reverse border-t bg-muted/20 px-6 py-4 sm:flex-row">
            <AlertDialogCancel
              className="w-full sm:w-auto"
              disabled={submitting}
            >
              {t("confirmBack")}
            </AlertDialogCancel>
            <Button
              className="w-full sm:w-auto"
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {t("confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
