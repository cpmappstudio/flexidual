"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import { ArrowRight, BookOpen, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ChartConfig } from "@/components/ui/chart";
import { RadialChart } from "@/components/ui/radial-chart";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CourseProgress } from "@/lib/course-progress";

const overviewCardClassName =
  "min-h-0 gap-4 overflow-hidden rounded-[2rem] border-0 py-5 shadow-md ring-1 ring-border/80";

export function ClassOverviewSidebar({
  lessons,
  progress,
  onViewAllLessons,
}: {
  lessons: Doc<"lessons">[];
  progress: CourseProgress;
  onViewAllLessons: () => void;
}) {
  const t = useTranslations();
  const previewLessons = lessons.slice(0, 3);
  const chartConfig = {
    progress: {
      label: t("class.completed"),
      color: "var(--secondary)",
    },
  } satisfies ChartConfig;

  return (
    <aside className="grid gap-4 xl:sticky xl:top-[calc(var(--header-height)+1rem)] xl:h-[calc(100svh-var(--header-height)-2rem)] xl:self-start xl:grid-rows-[auto_minmax(0,1fr)]">
      <Card className={overviewCardClassName}>
        <CardHeader className="px-5">
          <CardTitle className="text-xl font-bold">
            {t("class.courseProgress")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center gap-4 px-5">
          <div className="flex justify-center">
            <RadialChart
              value={progress.percentage}
              label={t("class.completed")}
              fill="var(--color-progress)"
              config={chartConfig}
              showPercentage
              ariaLabel={`${t("class.courseProgress")}: ${progress.percentage}%`}
              className="mx-auto aspect-square size-32 min-h-32"
            />
          </div>

          <div className="h-24 bg-border" aria-hidden="true" />

          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
                <CircleCheck className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-bold leading-none text-foreground">
                  {progress.completedClasses}
                </p>
                <p className="mt-1 text-xs leading-tight text-muted-foreground">
                  {t("class.completedClasses")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info text-info-foreground">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-bold leading-none text-foreground">
                  {progress.pendingClasses}
                </p>
                <p className="mt-1 text-xs leading-tight text-muted-foreground">
                  {t("class.pendingClasses")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={overviewCardClassName}>
        <CardHeader className="px-5">
          <CardTitle className="text-xl font-bold">
            {t("navigation.lessons")}
          </CardTitle>
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewAllLessons}
              aria-label={t("class.viewAllLessons")}
            >
              <span className="hidden sm:inline">
                {t("class.viewAllLessons")}
              </span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3 px-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          {previewLessons.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {t("lesson.noLessonsForCurriculum")}
            </div>
          ) : (
            previewLessons.map((lesson) => (
              <div
                key={lesson._id}
                className="flex min-h-[68px] items-center gap-3 rounded-2xl border bg-sidebar px-4 py-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary/15 text-sm font-bold text-secondary">
                  {lesson.order}
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-foreground">
                    {lesson.title}
                  </p>
                  {lesson.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {lesson.description}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </aside>
  );
}
