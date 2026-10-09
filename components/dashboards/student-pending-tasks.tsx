"use client";

import { useQuery } from "convex/react";
import { CalendarClock, ArrowUpRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { carouselCardStyles } from "@/components/ui/carousel-card-styles";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function StudentPendingTasks({
  classIds,
  now,
  orgSlug,
  studentId,
}: {
  classIds: Id<"classes">[] | undefined;
  now: number;
  orgSlug: string;
  studentId?: string;
}) {
  const t = useTranslations("courseTasks");
  const formatter = useFormatter();
  const result = useQuery(
    api.courseTasks.listMyPending,
    classIds === undefined
      ? "skip"
      : { classIds, now, ...(studentId ? { studentId, orgSlug } : {}) },
  );
  const tasks = useRetainedQueryResult(
    result,
    `${orgSlug}:${studentId ?? "self"}:${classIds?.join(",") ?? "loading"}`,
  );

  return (
    <section
      className="flex min-w-0 flex-col gap-2 lg:h-full"
      aria-labelledby="pending-tasks-title"
    >
      <div className="flex min-w-0 items-center justify-left gap-2">
        <h2
          id="pending-tasks-title"
          className="flex min-w-0 items-center gap-2 text-base font-bold text-foreground sm:text-lg"
        >
          {t("dashboardTitle")}
        </h2>
        {tasks && tasks.length > 1 && (
          <span className="rounded-full bg-info/15 px-2.5 py-0.5 text-xs font-bold tabular-nums text-info">
            {tasks.length}
          </span>
        )}
      </div>

      {tasks === undefined ? (
        <Skeleton className="h-32 w-full rounded-xl xl:h-28" />
      ) : tasks.length === 0 ? (
        <div className="flex min-h-24 flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {t("dashboardEmpty")}
        </div>
      ) : (
        <Carousel
          opts={{ align: "start", containScroll: "trimSnaps" }}
          className="min-w-0"
          aria-label={t("dashboardTitle")}
        >
          <CarouselContent className="-ml-2">
            {tasks.map((task, index) => (
              <CarouselItem
                key={task.taskId}
                className="basis-[88%] pl-2 sm:basis-[70%] xl:basis-full"
                aria-label={`${index + 1} / ${tasks.length}`}
              >
                <Link
                  href={`/${orgSlug}/classes/${task.classId}?task=${task.taskId}`}
                  className={cn(
                    "group flex h-44 min-w-0 flex-col justify-between gap-2 p-4 xl:p-3",
                    carouselCardStyles("accent"),
                  )}
                >
                  <span className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-semibold text-info">
                      {task.className}
                    </span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-info transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="line-clamp-2 min-w-0 break-words text-base font-bold text-foreground [overflow-wrap:anywhere]">
                    {task.title}
                  </span>
                  {task.description && (
                    <span className="line-clamp-2 min-w-0 whitespace-pre-line break-words text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                      <span className="font-semibold text-foreground">
                        {t("instructions")}:{" "}
                      </span>
                      {task.description}
                    </span>
                  )}
                  <span className="flex min-w-0 items-center gap-2">
                    <CalendarClock
                      className="size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {t("deadlineLabel")}
                      </span>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {task.dueAt === undefined
                          ? t("noDeadline")
                          : formatter.dateTime(task.dueAt, {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: task.timeZone,
                            })}
                      </span>
                    </span>
                  </span>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>
          {tasks.length > 1 && (
            <div className="mt-2 flex items-center justify-end gap-2">
              <CarouselPrevious
                type="button"
                className="static size-8 translate-y-0"
                aria-label={t("dashboardPrevious")}
              />
              <CarouselNext
                type="button"
                className="static size-8 translate-y-0"
                aria-label={t("dashboardNext")}
              />
            </div>
          )}
        </Carousel>
      )}
    </section>
  );
}
