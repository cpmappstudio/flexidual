"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function QuizDurationField({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error?: string;
}) {
  const t = useTranslations("courseQuizzes");
  return (
    <div className="max-w-48 space-y-2">
      <Label htmlFor="quiz-duration">
        {t("durationLabel")}
        <span className="text-destructive" aria-hidden="true">
          *
        </span>
      </Label>
      <Input
        id="quiz-duration"
        type="text"
        inputMode="numeric"
        pattern="[0-9]+"
        maxLength={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required
        aria-invalid={!!error || undefined}
        aria-describedby={error ? "quiz-duration-error" : undefined}
      />
      {error && (
        <p id="quiz-duration-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function QuizShuffleField({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  const t = useTranslations("courseQuizzes");
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="quiz-shuffle-questions"
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        disabled={disabled}
        aria-describedby="quiz-shuffle-hint"
      />
      <div className="min-w-0 space-y-1">
        <Label htmlFor="quiz-shuffle-questions" className="leading-relaxed">
          {t("shuffleQuestions")}
        </Label>
        <p id="quiz-shuffle-hint" className="text-xs text-muted-foreground">
          {t("shuffleHint")}
        </p>
      </div>
    </div>
  );
}

export function QuizAttemptSummary({
  durationMinutes,
  shuffleQuestions,
}: {
  durationMinutes: number;
  shuffleQuestions: boolean;
}) {
  const t = useTranslations("courseQuizzes");
  return (
    <div className="space-y-3">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <dt className="text-sm font-medium">{t("durationSummaryLabel")}</dt>
          <dd className="text-sm">
            {t("durationValue", { count: durationMinutes })}
          </dd>
        </div>
        <div className="space-y-2">
          <dt className="text-sm font-medium">{t("questionOrderLabel")}</dt>
          <dd className="text-sm">
            {t(
              shuffleQuestions
                ? "questionOrderRandom"
                : "questionOrderAuthored",
            )}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {t("attemptSettingsLocked")}
      </p>
    </div>
  );
}
