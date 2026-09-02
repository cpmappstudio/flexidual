"use client";

import { useId, useMemo } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseBulkLessons } from "@/lib/bulk-lessons";

interface BulkLessonsInputProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function BulkLessonsInput({
  value,
  onValueChange,
}: BulkLessonsInputProps) {
  const t = useTranslations("lesson.bulk");
  const inputId = useId();
  const parsed = useMemo(() => parseBulkLessons(value), [value]);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId}>{t("label")}</Label>
        <Badge variant="secondary">
          {t("lessonCount", { count: parsed.lessons.length })}
        </Badge>
      </div>
      <Textarea
        id={inputId}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={t("placeholder")}
        className="min-h-60 resize-y font-mono text-sm"
      />
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t("titleDescriptionFormat")}</p>
        <p>{t("separatorFormat")}</p>
      </div>
      {parsed.invalidLines.length > 0 && (
        <p className="text-xs font-medium text-destructive">
          {t("invalidLines", { lines: parsed.invalidLines.join(", ") })}
        </p>
      )}
    </div>
  );
}
