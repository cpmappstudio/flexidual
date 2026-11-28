"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GRADING_CATEGORIES,
  type GradingCategory,
} from "@/lib/grading-weights";

export function GradingCategoryField({
  value,
  onChangeAction,
  disabled,
}: {
  value: GradingCategory | "";
  onChangeAction: (value: GradingCategory | "") => void;
  disabled?: boolean;
}) {
  const t = useTranslations("grading.weights");
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t("category")}</Label>
      <Select
        value={value || "unclassified"}
        onValueChange={(category) =>
          onChangeAction(
            category === "unclassified" ? "" : (category as GradingCategory),
          )
        }
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unclassified">{t("unclassified")}</SelectItem>
          {GRADING_CATEGORIES.map((category) => (
            <SelectItem key={category} value={category}>
              {t(`categories.${category}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("categoryHint")}</p>
    </div>
  );
}
