"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
  CalendarDays,
  Clock3,
  EllipsisVertical,
  Loader2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PageCreateButton,
  ResponsivePageAction,
} from "@/components/ui/responsive-page-action";
import { Calendar } from "@/components/ui/calendar";
import { EntityDialog } from "@/components/ui/entity-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { todayInTimeZone } from "@/lib/time-zone";

function toTimeInput(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function fromTimeInput(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function civilDateToLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

type AcademicPeriod = {
  _id: Id<"academicPeriods">;
  name: string;
  startDate: string;
  endDate: string;
};

export function AcademicSettings() {
  const t = useTranslations("settings.academic");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const { context, isLoading } = useSettingsContext();
  const settings = useQuery(
    api.academicSettings.get,
    context?.canViewInstitutionSettings
      ? { schoolId: context.institution._id }
      : "skip",
  );
  const createPeriod = useMutation(api.academicSettings.createPeriod);
  const updatePeriod = useMutation(api.academicSettings.updatePeriod);
  const removePeriod = useMutation(api.academicSettings.removePeriod);
  const updateScheduleWindow = useMutation(
    api.academicSettings.updateScheduleWindow,
  );
  const [periodDialogOpen, setPeriodDialogOpen] = React.useState(false);
  const [editingPeriod, setEditingPeriod] =
    React.useState<AcademicPeriod | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AcademicPeriod | null>(
    null,
  );
  const [periodName, setPeriodName] = React.useState("");
  const [periodRange, setPeriodRange] = React.useState<DateRange>();
  const [isSubmittingPeriod, setIsSubmittingPeriod] = React.useState(false);
  const [isDeletingPeriod, setIsDeletingPeriod] = React.useState(false);
  const [isSavingWindow, setIsSavingWindow] = React.useState(false);
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");

  React.useEffect(() => {
    if (!settings) return;
    setStartTime(toTimeInput(settings.scheduleStartMinutes));
    setEndTime(toTimeInput(settings.scheduleEndMinutes));
  }, [settings]);

  const dateFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  if (isLoading || (context?.canViewInstitutionSettings && settings === undefined)) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (!context?.canViewInstitutionSettings || !settings) {
    return (
      <section>
        <h2 className="border-b pb-3 text-xl font-semibold">
          {t("unavailable")}
        </h2>
      </section>
    );
  }
  const readOnly = !context.canManageInstitution;

  const resetPeriodForm = () => {
    setEditingPeriod(null);
    setPeriodName("");
    setPeriodRange(undefined);
  };

  const openPeriodDialog = (period?: AcademicPeriod) => {
    if (period) {
      setEditingPeriod(period);
      setPeriodName(period.name);
      setPeriodRange({
        from: civilDateToLocalDate(period.startDate),
        to: civilDateToLocalDate(period.endDate),
      });
    } else {
      resetPeriodForm();
    }
    setPeriodDialogOpen(true);
  };

  const handleSavePeriod = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!periodRange?.from || !periodRange.to) return;
    setIsSubmittingPeriod(true);
    try {
      const periodData = {
        name: periodName,
        startDate: format(periodRange.from, "yyyy-MM-dd"),
        endDate: format(periodRange.to, "yyyy-MM-dd"),
      };
      if (editingPeriod) {
        await updatePeriod({ id: editingPeriod._id, ...periodData });
        toast.success(t("periodUpdated"));
      } else {
        await createPeriod({
          schoolId: context.institution._id,
          ...periodData,
        });
        toast.success(t("periodCreated"));
      }
      setPeriodDialogOpen(false);
      resetPeriodForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("ACADEMIC_PERIOD_OVERLAP")
          ? t("periodOverlap")
          : message.includes("ACADEMIC_PERIOD_IN_USE")
            ? t("periodInUse")
            : t("periodError"),
      );
    } finally {
      setIsSubmittingPeriod(false);
    }
  };

  const handleDeletePeriod = async () => {
    if (!deleteTarget) return;
    setIsDeletingPeriod(true);
    try {
      const result = await removePeriod({ id: deleteTarget._id });
      if (!result.deleted) {
        toast.error(t("periodDeleteInUse"));
        return;
      }
      toast.success(t("periodDeleted"));
      setDeleteTarget(null);
    } catch {
      toast.error(t("periodDeleteError"));
    } finally {
      setIsDeletingPeriod(false);
    }
  };

  const handleSaveWindow = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingWindow(true);
    try {
      await updateScheduleWindow({
        schoolId: context.institution._id,
        startMinutes: fromTimeInput(startTime),
        endMinutes: fromTimeInput(endTime),
      });
      toast.success(t("windowSaved"));
    } catch {
      toast.error(t("windowError"));
    } finally {
      setIsSavingWindow(false);
    }
  };

  const today = todayInTimeZone(settings.timeZone ?? "UTC");

  return (
    <section className="grid gap-3">
      <h2 className="border-b pb-3 text-xl font-semibold">
        {t("title")} — {context.institution.name}
      </h2>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">{t("periods")}</h3>
          {!readOnly && (
            <ResponsivePageAction>
              <PageCreateButton
                onClick={() => openPeriodDialog()}
                label={t("addPeriod")}
              />
            </ResponsivePageAction>
          )}
        </div>

        <div className="overflow-hidden rounded-md border">
          <Table className="bg-card">
            <TableHeader className="bg-primary/95">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted">{t("name")}</TableHead>
                <TableHead className="text-muted">{t("dateRange")}</TableHead>
                <TableHead className="text-muted">{t("status")}</TableHead>
                {!readOnly && (
                  <TableHead className="w-20 text-right text-muted">
                    {t("actions")}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.periods.length ? (
                settings.periods.map((period) => {
                  const status =
                    today < period.startDate
                      ? "upcoming"
                      : today > period.endDate
                        ? "past"
                        : "current";
                  return (
                    <TableRow key={period._id}>
                      <TableCell className="font-medium">
                        {period.name}
                      </TableCell>
                      <TableCell>
                        {dateFormatter.format(
                          civilDateToLocalDate(period.startDate),
                        )}{" "}
                        –{" "}
                        {dateFormatter.format(
                          civilDateToLocalDate(period.endDate),
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === "current" ? "default" : "secondary"
                          }
                        >
                          {t(status)}
                        </Badge>
                      </TableCell>
                      {!readOnly && <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground data-[state=open]:bg-muted"
                              aria-label={`${t("actions")}: ${period.name}`}
                            >
                              <EllipsisVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              onSelect={() => openPeriodDialog(period)}
                            >
                              {commonT("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleteTarget(period)}
                            >
                              {commonT("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={readOnly ? 3 : 4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t("emptyPeriods")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {!readOnly && <EntityDialog
        open={periodDialogOpen}
        onOpenChange={(open) => {
          if (!isSubmittingPeriod) setPeriodDialogOpen(open);
          if (!open && !isSubmittingPeriod) resetPeriodForm();
        }}
        title={editingPeriod ? t("editPeriod") : t("createPeriod")}
        onSubmit={handleSavePeriod}
        isSubmitting={isSubmittingPeriod}
        submitDisabled={
          !periodName.trim() || !periodRange?.from || !periodRange.to
        }
        submitLabel={editingPeriod ? commonT("saveChanges") : t("create")}
        maxWidth="sm:max-w-[720px]"
      >
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="academic-period-name">{t("name")}</Label>
            <Input
              id="academic-period-name"
              value={periodName}
              onChange={(event) => setPeriodName(event.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("dateRange")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start bg-sidebar text-left font-normal"
                >
                  <CalendarDays />
                  {periodRange?.from && periodRange.to
                    ? `${dateFormatter.format(periodRange.from)} – ${dateFormatter.format(periodRange.to)}`
                    : t("selectDates")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={periodRange}
                  onSelect={setPeriodRange}
                  defaultMonth={periodRange?.from}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </EntityDialog>}

      {!readOnly && <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingPeriod) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deletePeriodTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deletePeriodDescription", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPeriod}>
              {commonT("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingPeriod}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeletePeriod();
              }}
            >
              {isDeletingPeriod && <Loader2 className="animate-spin" />}
              {commonT("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}

      <form className="grid gap-3" onSubmit={handleSaveWindow}>
        <h3 className="text-lg font-semibold">
          {t("scheduleWindow")} · {settings.timeZone || t("timeZoneRequired")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,14rem)_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="schedule-start">{t("startTime")}</Label>
            <div className="relative">
              <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="schedule-start"
                type="time"
                step={900}
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="pl-9"
                required
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schedule-end">{t("endTime")}</Label>
            <div className="relative">
              <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="schedule-end"
                type="time"
                step={900}
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="pl-9"
                required
                disabled={readOnly}
              />
            </div>
          </div>
          {!readOnly && (
            <Button
              type="submit"
              disabled={isSavingWindow || !startTime || !endTime}
            >
              {t("saveWindow")}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
