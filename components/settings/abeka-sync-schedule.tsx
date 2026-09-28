"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AbekaSchedule } from "@/lib/abeka/schedule";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const initial: AbekaSchedule = {
  mode: "weekly",
  time: "08:00",
  weekday: 1,
  stopAtPeriodEnd: true,
};

export function AbekaSyncSchedule({
  schoolId,
  schedule,
  timeZone,
  period,
  nextSyncAt,
  disabled,
}: {
  schoolId: Id<"schools">;
  schedule?: AbekaSchedule | null;
  timeZone?: string | null;
  period?: { name: string; endDate: string } | null;
  nextSyncAt?: number;
  disabled: boolean;
}) {
  const t = useTranslations("settings.integrations");
  const format = useFormatter();
  const update = useMutation(api.abeka.updateSchedule);
  const saved = schedule ?? initial;
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setDraft(JSON.parse(savedKey) as AbekaSchedule);
  }, [savedKey]);
  async function save(value: AbekaSchedule) {
    if (inFlight.current || disabled) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) {
      setDraft(saved);
      return;
    }
    setDraft(value);
    inFlight.current = true;
    setSaving(true);
    try {
      await update({ schoolId, schedule: value });
    } catch {
      setDraft(saved);
      toast.error(t("actionError"));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  const automatic = draft.mode !== "manual";
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
      <dt className="pt-1.5">
        <Label htmlFor="abeka-sync-mode" className="font-normal">
          {t("nextSync")}:
        </Label>
      </dt>
      <dd className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={draft.mode}
            disabled={disabled || saving}
            onValueChange={(mode) =>
              void save({ ...draft, mode: mode as AbekaSchedule["mode"] })
            }
          >
            <SelectTrigger
              id="abeka-sync-mode"
              size="sm"
              className="w-auto min-w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["manual", "weekdays", "weekly"] as const).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`schedule.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {draft.mode === "weekly" && (
            <Select
              value={String(draft.weekday)}
              disabled={disabled || saving}
              onValueChange={(day) =>
                void save({ ...draft, weekday: Number(day) })
              }
            >
              <SelectTrigger
                aria-label={t("schedule.day")}
                size="sm"
                className="w-auto min-w-32"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {format.dateTime(new Date(Date.UTC(2024, 0, 7 + day, 12)), {
                      weekday: "long",
                      timeZone: "UTC",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {automatic && (
            <Input
              type="time"
              aria-label={t("schedule.time")}
              className="h-8 w-auto"
              value={draft.time}
              disabled={disabled || saving}
              onChange={(event) =>
                setDraft({ ...draft, time: event.target.value })
              }
              onBlur={() => {
                if (draft.time !== saved.time) void save(draft);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          )}
          {saving && <Spinner aria-label={t("loading")} />}
        </div>
        {automatic ? (
          <>
            <div className="flex items-center gap-2">
              <Checkbox
                id="abeka-sync-period"
                checked={draft.stopAtPeriodEnd}
                disabled={disabled || saving}
                onCheckedChange={(checked) =>
                  void save({ ...draft, stopAtPeriodEnd: checked === true })
                }
              />
              <Label
                htmlFor="abeka-sync-period"
                className="text-xs font-normal"
              >
                {t("schedule.stopAtPeriodEnd")}
              </Label>
            </div>
            <p className="text-xs" aria-live="polite">
              {nextSyncAt && timeZone
                ? t("schedule.next", {
                    date: format.dateTime(nextSyncAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone,
                    }),
                    timeZone,
                  })
                : !timeZone
                  ? t("schedule.noTimeZone")
                  : draft.stopAtPeriodEnd && !period
                    ? t("schedule.noPeriod")
                    : t("schedule.paused")}
            </p>
            {draft.stopAtPeriodEnd && period && (
              <p className="text-xs">
                {t("schedule.period", {
                  name: period.name,
                  date: format.dateTime(
                    new Date(`${period.endDate}T12:00:00Z`),
                    { dateStyle: "medium", timeZone: "UTC" },
                  ),
                })}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs">{t("schedule.manualNote")}</p>
        )}
      </dd>
    </div>
  );
}
