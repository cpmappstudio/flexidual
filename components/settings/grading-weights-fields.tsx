"use client";

import { useId } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GRADING_CATEGORIES,
  gradingWeightInputs,
  parseGradingWeightInputs,
  type GradingWeightInputs,
  type GradingWeights,
} from "@/lib/grading-weights";

export function GradingWeightsFields({
  value,
  onChangeAction,
  disabled = false,
}: {
  value: GradingWeightInputs;
  onChangeAction: (value: GradingWeightInputs) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("grading.weights");
  const format = useFormatter();
  const id = useId();
  const total = GRADING_CATEGORIES.reduce(
    (sum, category) => sum + (Number(value[category]) || 0),
    0,
  );
  const invalid = !parseGradingWeightInputs(value);
  return (
    <fieldset disabled={disabled} className="grid gap-3">
      <legend className="sr-only">{t("title")}</legend>
      <div className="overflow-hidden rounded-md border">
        <Table
          className="bg-card"
          aria-label={t("title")}
          scrollLabel={t("title")}
        >
          <TableHeader className="bg-primary/95">
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="text-muted">
                {t("category")}
              </TableHead>
              <TableHead scope="col" className="w-40 text-right text-muted">
                {t("percentage")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {GRADING_CATEGORIES.map((category) => (
              <TableRow key={category}>
                <TableHead scope="row">
                  <Label htmlFor={`${id}-${category}`}>
                    {t(`categories.${category}`)}{" "}
                    <span className="sr-only">(%)</span>
                  </Label>
                </TableHead>
                <TableCell>
                  <Input
                    id={`${id}-${category}`}
                    className="text-right tabular-nums"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={value[category]}
                    onChange={(event) =>
                      onChangeAction({
                        ...value,
                        [category]: event.target.value,
                      })
                    }
                    required
                    aria-invalid={invalid || undefined}
                    aria-describedby={`${id}-total ${id}-validation`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell
                colSpan={2}
                id={`${id}-total`}
                className="text-right tabular-nums"
                aria-live="polite"
              >
                {t("total", {
                  total: format.number(total, { maximumFractionDigits: 2 }),
                })}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p id={`${id}-validation`} className="text-sm text-muted-foreground">
        {t("validation")}
      </p>
    </fieldset>
  );
}

export function CourseGradingWeightsFields({
  value,
  institutionalWeights,
  onChangeAction,
  disabled = false,
}: {
  value: GradingWeightInputs | null;
  institutionalWeights: GradingWeights | null;
  onChangeAction: (value: GradingWeightInputs | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("grading.weights");
  const id = useId();
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("courseDescription")}</p>
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={value !== null}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChangeAction(
              checked === true
                ? gradingWeightInputs(institutionalWeights)
                : null,
            )
          }
        />
        <Label htmlFor={id}>{t("override")}</Label>
      </div>
      {value === null && !institutionalWeights ? (
        <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>
      ) : (
        <GradingWeightsFields
          value={value ?? gradingWeightInputs(institutionalWeights)}
          onChangeAction={onChangeAction}
          disabled={disabled || value === null}
        />
      )}
    </section>
  );
}
