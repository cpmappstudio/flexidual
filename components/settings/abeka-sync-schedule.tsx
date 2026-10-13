"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AbekaSchedule } from "@/lib/abeka/schedule";
import { Button } from "@/components/ui/button";
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
  const common = useTranslations("common");
  const format = useFormatter();
  const update = useMutation(api.abeka.updateSchedule);
  const saved = schedule ?? initial;
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const savedKey = JSON.stringify(saved);
  const changed = JSON.stringify(draft) !== savedKey;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time);
  useEffect(() => {
    setDraft(JSON.parse(savedKey) as AbekaSchedule);
  }, [savedKey]);
  // ponytail: apply the complete draft once, never schedule intermediate edits.
  async function save() {
    if (inFlight.current || disabled || !changed || !validTime) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await update({ schoolId, schedule: draft });
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
              setDraft({ ...draft, mode: mode as AbekaSchedule["mode"] })
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
                setDraft({ ...draft, weekday: Number(day) })
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
            />
          )}
          {changed && (
            <Button
              type="button"
              size="sm"
              disabled={disabled || saving || !validTime}
              onClick={() => void save()}
            >
              {saving && <Spinner aria-label={t("loading")} />}
              {common("save")}
            </Button>
          )}
        </div>
        {automatic ? (
          <>
            <div className="flex items-center gap-2">
              <Checkbox
                id="abeka-sync-period"
                checked={draft.stopAtPeriodEnd}
                disabled={disabled || saving}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, stopAtPeriodEnd: checked === true })
                }
              />
              <Label
                htmlFor="abeka-sync-period"
                className="text-xs font-normal"
              >
                {t("schedule.stopAtPeriodEnd")}
              </Label>
            </div>
            {!changed && (
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
            )}
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
          !changed && <p className="text-xs">{t("schedule.manualNote")}</p>
        )}
      </dd>
    </div>
  );
}
