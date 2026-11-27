"use client";

import Image from "next/image";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CourseTaskHeader({
  task,
  canManage,
  submissionsOpen,
  onEdit,
  onDelete,
}: {
  task: Doc<"courseTasks">;
  canManage: boolean;
  submissionsOpen: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("courseTasks");
  const quizT = useTranslations("courseQuizzes");
  const quiz = task.kind === "quiz";
  const editLabel = quiz ? quizT("editQuiz") : t("editTask");
  const deleteLabel = quiz ? quizT("deleteQuiz") : t("deleteTask");
  const status =
    task.releasedAt === undefined
      ? "scheduledStatus"
      : submissionsOpen
        ? "visibleStatus"
        : "closedStatus";

  return (
    <header className="flex min-w-0 items-start gap-3 sm:gap-4">
      <Image
        src={quiz ? "/quizzes-icon.svg" : "/assigments-icon.svg"}
        alt={t(quiz ? "quizType" : "assignmentType")}
        width={60}
        height={60}
        className="size-12 shrink-0 sm:size-15"
      />
      <div className="min-w-0 flex-1">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 sm:gap-x-4">
          {canManage && (
            <Badge
              className={cn(
                "col-start-1 row-start-1 justify-self-start font-semibold",
                task.releasedAt !== undefined && submissionsOpen
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary/15 text-secondary-foreground",
              )}
            >
              {t(status)}
            </Badge>
          )}
          <h3 className="col-start-1 row-start-2 min-w-0 break-words text-xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-2xl">
            {task.title}
          </h3>
          {canManage && (
            <div className="col-start-2 row-start-2 flex shrink-0 items-center gap-1 sm:row-start-1">
              <Button
                type="button"
                size="icon-lg"
                variant="ghost"
                aria-label={editLabel}
                className="text-foreground hover:bg-primary/5 hover:text-primary sm:h-8 sm:w-auto sm:px-2.5"
                onClick={onEdit}
              >
                <Pencil className="size-4 text-primary" aria-hidden="true" />
                <span className="hidden sm:inline">{editLabel}</span>
              </Button>
              <Button
                type="button"
                size="icon-lg"
                variant="ghost"
                aria-label={deleteLabel}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-auto sm:px-2.5"
                onClick={onDelete}
              >
                <Trash2
                  className="size-4 text-destructive"
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{deleteLabel}</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
