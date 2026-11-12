"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isValidGradingPolicy, type GradingPolicy } from "@/lib/grading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GradingSettings({
  schoolId,
  policy,
  readOnly,
}: {
  schoolId: Id<"schools">;
  policy: GradingPolicy;
  readOnly: boolean;
}) {
  const t = useTranslations("grading");
  const update = useMutation(api.academicSettings.updateGradingPolicy);
  const [scaleMax, setScaleMax] = useState(String(policy.scaleMax));
  const [decimalPlaces, setDecimalPlaces] = useState(
    String(policy.decimalPlaces),
  );
  const [defaultMaxPoints, setDefaultMaxPoints] = useState(
    String(policy.defaultMaxPoints),
  );
  const [passingPercentage, setPassingPercentage] = useState(
    policy.passingPercentage?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const nextPolicy: GradingPolicy = {
    scaleMax: Number(scaleMax),
    decimalPlaces: Number(decimalPlaces),
    defaultMaxPoints: Number(defaultMaxPoints),
    ...(passingPercentage === ""
      ? {}
      : { passingPercentage: Number(passingPercentage) }),
  };
  const changed =
    nextPolicy.scaleMax !== policy.scaleMax ||
    nextPolicy.decimalPlaces !== policy.decimalPlaces ||
    nextPolicy.defaultMaxPoints !== policy.defaultMaxPoints ||
    nextPolicy.passingPercentage !== policy.passingPercentage;

  return (
    <form
      className="grid gap-3 border-t pt-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || readOnly || !changed) return;
        if (!isValidGradingPolicy(nextPolicy)) {
          toast.error(t("settingsError"));
          return;
        }
        setSaving(true);
        try {
          await update({ schoolId, policy: nextPolicy });
          toast.success(t("settingsSaved"));
        } catch {
          toast.error(t("settingsError"));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3 className="text-lg font-semibold">{t("settingsTitle")}</h3>
      <p className="text-sm text-muted-foreground">
        {t("settingsDescription")}
      </p>
      <fieldset
        disabled={readOnly || saving}
        className="grid gap-4 sm:grid-cols-3"
      >
        <div className="grid gap-2">
          <Label htmlFor="grading-scale">{t("scaleMax")}</Label>
          <Input
            id="grading-scale"
            type="number"
            min={10 ** -Number(decimalPlaces)}
            max={1000000}
            step={10 ** -Number(decimalPlaces)}
            required
            value={scaleMax}
            onChange={(e) => setScaleMax(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="grading-decimals">{t("decimalPlaces")}</Label>
          <Input
            id="grading-decimals"
            type="number"
            min={0}
            max={2}
            step={1}
            required
            value={decimalPlaces}
            onChange={(e) => setDecimalPlaces(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="grading-default-points">
            {t("defaultMaxPoints")}
          </Label>
          <Input
            id="grading-default-points"
            type="number"
            min={10 ** -Number(decimalPlaces)}
            max={1000000}
            step={10 ** -Number(decimalPlaces)}
            required
            value={defaultMaxPoints}
            onChange={(e) => setDefaultMaxPoints(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="grading-passing-percentage">
            {t("passingPercentage")}
          </Label>
          <Input
            id="grading-passing-percentage"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={passingPercentage}
            aria-describedby="grading-passing-percentage-hint"
            onChange={(e) => setPassingPercentage(e.target.value)}
          />
          <p
            id="grading-passing-percentage-hint"
            className="text-sm text-muted-foreground"
          >
            {t("passingPercentageHint")}
          </p>
        </div>
      </fieldset>
      {!readOnly && (
        <div>
          <Button type="submit" disabled={saving || !changed}>
            {t("saveSettings")}
          </Button>
        </div>
      )}
    </form>
  );
}
