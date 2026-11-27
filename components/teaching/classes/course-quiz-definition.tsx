"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { QUIZ_QUESTION_TYPE_LABELS } from "@/lib/course-quizzes";
import type { Doc } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function CourseQuizDefinition({
  task,
  canManage,
}: {
  task: Doc<"courseTasks">;
  canManage: boolean;
}) {
  const t = useTranslations("courseQuizzes");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const definition = useQuery(
    api.courseQuizzes.get,
    canManage && open ? { taskId: task._id, now: task.updatedAt } : "skip",
  );
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group min-w-0 space-y-4"
    >
      {canManage && (
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 px-0 hover:bg-transparent has-[>svg]:px-0"
          >
            {t("previewQuiz")}
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
      )}
      <CollapsibleContent>
        {canManage &&
          (definition === undefined ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <ol className="divide-y">
                {definition.questions.map((question, index) => (
                  <li
                    key={question._id}
                    className="min-w-0 space-y-3 py-4 first:pt-0"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
                      <h5>
                        {t("questionNumber", { number: index + 1 })} ·{" "}
                        {t(QUIZ_QUESTION_TYPE_LABELS[question.kind])}
                      </h5>
                      <span>
                        {t("questionPoints", {
                          points: format.number(question.maxPoints),
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                      {question.prompt}
                    </p>
                    {question.kind !== "text" && (
                      <ul className="space-y-2">
                        {question.options.map((option) => (
                          <li
                            key={option.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {option.label}
                            </span>
                            {(question.kind === "single_choice"
                              ? option.id === question.correctOptionId
                              : question.correctOptionIds?.includes(
                                  option.id,
                                )) && (
                              <span className="flex shrink-0 items-center gap-1 font-medium text-primary">
                                <Check className="size-4" aria-hidden="true" />
                                {t("correct")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </>
          ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CourseQuizInstructions({
  description,
  collapsible = false,
}: {
  description?: string;
  collapsible?: boolean;
}) {
  const t = useTranslations("courseTasks");
  if (!description?.trim()) return null;
  const content = (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
      {description}
    </p>
  );
  return collapsible ? (
    <Collapsible className="group">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 px-0 hover:bg-transparent has-[>svg]:px-0"
        >
          {t("instructions")}
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{content}</CollapsibleContent>
    </Collapsible>
  ) : (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{t("instructions")}</h4>
      {content}
    </section>
  );
}
