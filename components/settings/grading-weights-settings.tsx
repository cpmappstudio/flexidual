"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  gradingWeightInputs,
  parseGradingWeightInputs,
  sameGradingWeights,
  type GradingWeightInputs,
} from "@/lib/grading-weights";
import { GradingWeightsFields } from "./grading-weights-fields";

export function GradingWeightsSettings({
  schoolId,
  readOnly,
}: {
  schoolId: Id<"schools">;
  readOnly: boolean;
}) {
  const t = useTranslations("grading.weights");
  const state = useQuery(api.academicSettings.getGradingWeights, { schoolId });
  const update = useMutation(api.academicSettings.updateGradingWeights);
  const [draft, setDraft] = useState<{
    version: number;
    inputs: GradingWeightInputs;
  }>();
  const [saving, setSaving] = useState(false);
  const [pendingVersion, setPendingVersion] = useState(0);
  if (state === undefined) return <Skeleton className="h-40 w-full" />;
  if (!state) return null;
  const inputs = draft?.inputs ?? gradingWeightInputs(state.weights);
  const weights = parseGradingWeightInputs(inputs);
  const changed = !sameGradingWeights(weights, state.weights);
  const stale = !!draft && draft.version !== state.version && changed;
  const busy = saving || state.version < pendingVersion;
  return (
    <form
      className="grid gap-3 border-t pt-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (readOnly || busy || stale || !changed || !weights) return;
        setSaving(true);
        try {
          const version = await update({
            schoolId,
            weights,
            expectedVersion: draft?.version ?? state.version,
          });
          setPendingVersion(version);
          toast.success(t("saved"));
        } catch {
          toast.error(t("saveError"));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3 className="text-lg font-semibold">{t("title")}</h3>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <GradingWeightsFields
        value={inputs}
        disabled={readOnly || busy || stale}
        onChangeAction={(inputs) =>
          setDraft({
            version: changed
              ? (draft?.version ?? state.version)
              : state.version,
            inputs,
          })
        }
      />
      {stale && (
        <p role="alert" className="text-sm text-destructive">
          {t("stale")}
        </p>
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy || stale || !changed || !weights}
          >
            {t("save")}
          </Button>
          {stale && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(undefined)}
            >
              {t("reload")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
