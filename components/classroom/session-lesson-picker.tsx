"use client";

import { useId, useMemo, useState } from "react";
import { BookOpenCheck, Loader2, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { LESSON_STATUS_STYLES } from "@/components/teaching/classes/lesson-status-styles";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type LessonSelectionItem = {
  lessonId: Id<"lessons">;
  title: string;
  order: number;
  previousSessionCount: number;
  lastRecordedAt?: number;
};

interface SessionLessonPickerProps {
  lessons: LessonSelectionItem[] | undefined;
  selectedLessons: Set<Id<"lessons">>;
  onSelectedLessonsChange: (selected: Set<Id<"lessons">>) => void;
  disabled?: boolean;
}

type LessonFilter = "pending" | "taught" | "all";

export function SessionLessonPicker({
  lessons,
  selectedLessons,
  onSelectedLessonsChange,
  disabled = false,
}: SessionLessonPickerProps) {
  const t = useTranslations("classroom.closeout");
  const classT = useTranslations("class");
  const format = useFormatter();
  const headingId = useId();
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>("pending");
  const [lessonQuery, setLessonQuery] = useState("");

  const lessonCounts = useMemo(() => {
    const total = lessons?.length ?? 0;
    const taught =
      lessons?.filter((lesson) => lesson.previousSessionCount > 0).length ?? 0;
    return { total, taught, pending: total - taught };
  }, [lessons]);
  const filteredLessons = useMemo(() => {
    const normalizedQuery = lessonQuery.trim().toLocaleLowerCase();
    return (lessons ?? []).filter((lesson) => {
      const status = lesson.previousSessionCount > 0 ? "taught" : "pending";
      const matchesStatus = lessonFilter === "all" || lessonFilter === status;
      const matchesQuery =
        !normalizedQuery ||
        lesson.title.toLocaleLowerCase().includes(normalizedQuery) ||
        String(lesson.order).includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [lessons, lessonFilter, lessonQuery]);

  return (
    <section className="space-y-4" aria-labelledby={headingId}>
      <div className="flex items-start gap-3">
        <BookOpenCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h3 id={headingId} className="font-semibold">
            {t("lessonsTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("lessonsDescription")}
          </p>
        </div>
      </div>
      <div className="sticky top-0 z-10 -mx-1 grid gap-3 bg-background/95 px-1 py-2 backdrop-blur lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={lessonQuery}
            onChange={(event) => setLessonQuery(event.target.value)}
            placeholder={t("searchLessons")}
            aria-label={t("searchLessons")}
            className="pl-9"
            disabled={disabled}
          />
        </div>
        <ToggleGroup
          type="single"
          value={lessonFilter}
          variant="outline"
          size="sm"
          aria-label={t("filterLabel")}
          className="grid grid-cols-3"
          disabled={disabled}
          onValueChange={(value) => {
            if (value) setLessonFilter(value as LessonFilter);
          }}
        >
          {(
            [
              ["pending", lessonCounts.pending],
              ["taught", lessonCounts.taught],
              ["all", lessonCounts.total],
            ] as const
          ).map(([filter, count]) => (
            <ToggleGroupItem
              key={filter}
              value={filter}
              className="group h-9 min-w-0 px-3"
            >
              <span className="truncate">{t(`filter.${filter}`)}</span>
              <span className="tabular-nums text-muted-foreground group-data-[state=on]:text-accent-foreground/70">
                {count}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {lessons === undefined ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : lessons.length === 0 ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          {t("noLessons")}
        </p>
      ) : filteredLessons.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noMatchingLessons")}
        </p>
      ) : (
        <div className="grid gap-2">
          {filteredLessons.map((lesson) => {
            const status =
              lesson.previousSessionCount > 0 ? "taught" : "pending";
            const isSelected = selectedLessons.has(lesson.lessonId);
            const history = lesson.lastRecordedAt
              ? t("previouslyRecordedDetails", {
                  count: lesson.previousSessionCount,
                  date: format.dateTime(lesson.lastRecordedAt, {
                    dateStyle: "medium",
                  }),
                })
              : undefined;
            return (
              <label
                key={lesson.lessonId}
                className={cn(
                  "grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-3 transition-colors",
                  isSelected
                    ? "border-success/50 bg-success/5"
                    : "hover:bg-muted/50",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const next = new Set(selectedLessons);
                    if (checked) next.add(lesson.lessonId);
                    else next.delete(lesson.lessonId);
                    onSelectedLessonsChange(next);
                  }}
                />
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                    LESSON_STATUS_STYLES[status].indicator,
                  )}
                >
                  {lesson.order}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 break-words text-sm font-medium leading-snug">
                    {lesson.title}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-xs",
                      LESSON_STATUS_STYLES[status].label,
                    )}
                  >
                    {status === "taught"
                      ? [classT("lessonTaught"), history]
                          .filter(Boolean)
                          .join(" · ")
                      : classT("lessonPending")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
