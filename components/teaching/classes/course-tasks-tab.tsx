"use client";

import { useEffect, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CourseTaskDetail } from "./course-task-detail";
import { CourseTaskEditor } from "./course-task-editor";
import { DetailCarousel } from "./detail-carousel";
import type { TaskAttachment } from "./course-task-attachments";

export function CourseTasksTab({
  classId,
  canManage,
  timeZone,
  initialTaskId,
}: {
  classId: Id<"classes">;
  canManage: boolean;
  timeZone: string;
  initialTaskId?: Id<"courseTasks">;
}) {
  const t = useTranslations("courseTasks");
  const format = useFormatter();
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseTasks.listForClass,
    { classId },
    { initialNumItems: 20 },
  );
  const [selectedId, setSelectedId] = useState<Id<"courseTasks"> | undefined>(
    initialTaskId,
  );
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [editor, setEditor] = useState<{
    task?: Doc<"courseTasks">;
    materials: TaskAttachment[];
  }>();

  useEffect(() => {
    setSelectedId(initialTaskId);
  }, [initialTaskId]);

  const orderedTasks = [...results].reverse();
  const activeTaskId = selectedId ?? orderedTasks.at(-1)?._id;
  const selectedIndex = orderedTasks.findIndex(
    (task) => task._id === activeTaskId,
  );

  useEffect(() => {
    if (!carouselApi || selectedIndex < 0) return;
    const scrollToSelectedTask = () => carouselApi.scrollTo(selectedIndex);
    scrollToSelectedTask();
    carouselApi.on("reInit", scrollToSelectedTask);
    return () => {
      carouselApi.off("reInit", scrollToSelectedTask);
    };
  }, [carouselApi, selectedIndex]);

  function select(id: Id<"courseTasks">) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("task", id);
    window.history.replaceState(null, "", url);
  }

  function formatTaskDate(value: number) {
    return format.dateTime(value, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
  }

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setEditor({ materials: [] })}>
            <Plus className="size-4" />
            {t("newTask")}
          </Button>
        </div>
      )}
      <DetailCarousel
        title={t("heading")}
        olderLabel={t("olderTasks")}
        newerLabel={t("newerTasks")}
        showNavigation={results.length > 1}
        setApi={setCarouselApi}
      >
        {status === "LoadingFirstPage" ? (
          <div className="space-y-5">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <div className="space-y-5">
            <CarouselContent className="-ml-3">
              {orderedTasks.map((task, index) => {
                const isSelected = task._id === activeTaskId;
                const availabilityDate = task.releasedAt ?? task.availableAt;
                const cardMeta =
                  availabilityDate === undefined
                    ? t("noStartDate")
                    : t("availableOn", {
                        date: formatTaskDate(availabilityDate),
                      });
                const deadline =
                  task.dueAt === undefined
                    ? t("noDeadline")
                    : t("deadline", { date: formatTaskDate(task.dueAt) });
                return (
                  <CarouselItem
                    key={task._id}
                    className="basis-[80%] pl-3 sm:basis-[48%] 2xl:basis-[34%]"
                    aria-label={`${index + 1} / ${orderedTasks.length}`}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => select(task._id)}
                      className={cn(
                        "flex h-32 w-full min-w-0 flex-col justify-center gap-1.5 rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        isSelected
                          ? "border-secondary/60 bg-sidebar text-foreground shadow-[inset_3px_0_0_var(--secondary)] hover:bg-muted/40"
                          : "border-border bg-sidebar text-foreground hover:bg-muted",
                      )}
                    >
                      <span className="line-clamp-2 min-w-0 break-words text-sm font-bold [overflow-wrap:anywhere]">
                        {task.title}
                      </span>
                      <span className="block min-w-0 truncate text-xs text-muted-foreground">
                        {cardMeta}
                      </span>
                      <span
                        className={cn(
                          "block min-w-0 truncate text-xs",
                          task.dueAt === undefined
                            ? "text-muted-foreground"
                            : "font-medium text-foreground/80",
                        )}
                      >
                        {deadline}
                      </span>
                    </button>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            {status === "CanLoadMore" && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => loadMore(20)}
                >
                  {t("loadMore")}
                </Button>
              </div>
            )}
            <Separator />
            <div className="min-w-0">
              {activeTaskId ? (
                <CourseTaskDetail
                  key={activeTaskId}
                  classId={classId}
                  taskId={activeTaskId}
                  timeZone={timeZone}
                  onEdit={(task, materials) => setEditor({ task, materials })}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("selectTask")}
                </p>
              )}
            </div>
          </div>
        )}
      </DetailCarousel>
      {editor && (
        <CourseTaskEditor
          key={editor.task?._id ?? "new"}
          classId={classId}
          task={editor.task}
          materials={editor.materials}
          timeZone={timeZone}
          onClose={() => setEditor(undefined)}
          onSaved={(id) => {
            setEditor(undefined);
            select(id);
          }}
        />
      )}
    </div>
  );
}
