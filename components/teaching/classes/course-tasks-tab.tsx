"use client";

import { useEffect, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { carouselCardStyles } from "@/components/ui/carousel-card-styles";
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
  const removeTask = useMutation(api.courseTasks.remove);
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
  const [taskToDelete, setTaskToDelete] = useState<Doc<"courseTasks">>();
  const [deleting, setDeleting] = useState(false);
  const [deletedTaskIds, setDeletedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setSelectedId(initialTaskId);
  }, [initialTaskId]);

  const visibleTasks = results.filter((task) => !deletedTaskIds.has(task._id));
  const orderedTasks = [...visibleTasks].reverse();
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

  async function confirmDelete() {
    if (!taskToDelete || deleting) return;
    setDeleting(true);
    try {
      await removeTask({ taskId: taskToDelete._id });
      setDeletedTaskIds((current) => new Set(current).add(taskToDelete._id));
      if (activeTaskId === taskToDelete._id) {
        setSelectedId(undefined);
        const url = new URL(window.location.href);
        url.searchParams.delete("task");
        window.history.replaceState(null, "", url);
      }
      setTaskToDelete(undefined);
      toast.success(t("deleteSuccess"));
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(false);
    }
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
        showNavigation={visibleTasks.length > 1}
        setApi={setCarouselApi}
      >
        {status === "LoadingFirstPage" ? (
          <div className="space-y-5">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : visibleTasks.length === 0 ? (
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
                        "flex h-32 w-full min-w-0 flex-col justify-center gap-1.5 px-4 py-3 text-left",
                        carouselCardStyles(isSelected ? "accent" : "default"),
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
                  onDelete={setTaskToDelete}
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
      <AlertDialog
        open={taskToDelete !== undefined}
        onOpenChange={(open) => {
          if (!open && !deleting) setTaskToDelete(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader className="items-center text-center sm:text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-center">
                <p>{t("deleteConfirmDescription")}</p>
                <p className="min-w-0 break-words font-semibold text-foreground [overflow-wrap:anywhere]">
                  {taskToDelete?.title}
                </p>
                <p>{t("deleteConfirmConsequences")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col items-stretch justify-center sm:flex-row sm:items-center sm:justify-center">
            <AlertDialogCancel disabled={deleting} className="w-full sm:w-auto">
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
              className="w-full sm:w-auto"
            >
              {deleting ? t("deletingTask") : t("deleteTask")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
