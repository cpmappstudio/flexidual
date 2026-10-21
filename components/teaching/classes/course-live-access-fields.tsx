"use client";

import { useId } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import type { LiveAccess } from "@/convex/model/liveAccess";
import { GradeCheckboxList } from "./grade-checkbox-list";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslations } from "next-intl";

interface CourseLiveAccessFieldsProps {
  value: LiveAccess;
  courseGradeCode: string;
  grades?: Doc<"institutionGrades">[];
  onChangeAction: (value: LiveAccess) => void;
}

export function CourseLiveAccessFields({
  value,
  courseGradeCode,
  grades,
  onChangeAction,
}: CourseLiveAccessFieldsProps) {
  const t = useTranslations();
  const fieldId = useId();

  return (
    <div className="grid gap-3">
      <div>
        <Label>{t("class.liveAccess")}</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("class.liveAccessDescription")}
        </p>
      </div>
      <RadioGroup
        value={value.mode}
        onValueChange={(mode) =>
          onChangeAction({
            mode: mode as LiveAccess["mode"],
            allowedGradeCodes:
              mode === "school"
                ? value.allowedGradeCodes.length > 0
                  ? value.allowedGradeCodes
                  : courseGradeCode
                    ? [courseGradeCode]
                    : []
                : [],
          })
        }
        className="grid gap-3 sm:grid-cols-2"
      >
        <Label
          htmlFor={`${fieldId}-private`}
          className="flex cursor-pointer items-start gap-3 rounded-lg border bg-sidebar p-3 font-normal"
        >
          <RadioGroupItem
            id={`${fieldId}-private`}
            value="private"
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">
              {t("class.privateAccess")}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {t("class.privateAccessDescription")}
            </span>
          </span>
        </Label>
        <Label
          htmlFor={`${fieldId}-school`}
          className="flex cursor-pointer items-start gap-3 rounded-lg border bg-sidebar p-3 font-normal"
        >
          <RadioGroupItem
            id={`${fieldId}-school`}
            value="school"
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">{t("class.schoolAccess")}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {t("class.schoolAccessDescription")}
            </span>
          </span>
        </Label>
      </RadioGroup>

      {value.mode === "school" && (
        <div className="grid gap-2">
          <Label>{t("class.liveAccessGrades")}</Label>
          <GradeCheckboxList
            grades={grades}
            value={value.allowedGradeCodes}
            onChangeAction={(allowedGradeCodes) =>
              onChangeAction({ mode: "school", allowedGradeCodes })
            }
          />
          {value.allowedGradeCodes.length === 0 && (
            <p className="text-sm text-destructive">
              {t("class.liveAccessGradeRequired")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
