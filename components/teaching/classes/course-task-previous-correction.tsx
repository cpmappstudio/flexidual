"use client";

import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import type { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TaskAttachmentList } from "./course-task-attachments";

type PreviousCorrection = FunctionReturnType<
  typeof api.courseTaskSubmissions.get
>["previousCorrection"];

export function TaskPreviousCorrection({
  correction,
  timeZone,
  compactFiles = false,
}: {
  correction: PreviousCorrection;
  timeZone: string;
  compactFiles?: boolean;
}) {
  const t = useTranslations("courseTasks.previousCorrection");
  const format = useFormatter();
  if (!correction) return null;

  return (
    <Collapsible key={correction.revision} asChild>
      <section className="min-w-0 border-t pt-5">
        <h3>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="group h-auto min-h-11 w-full justify-start gap-2 whitespace-normal px-0 py-2 text-left text-muted-foreground hover:bg-transparent hover:text-foreground has-[>svg]:px-0"
            >
              <ChevronRight
                className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                aria-hidden="true"
              />
              <span className="font-medium">{t("title")}</span>
            </Button>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>
              {t("submittedAt", {
                date: format.dateTime(correction.submittedAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone,
                }),
              })}
            </p>
          </div>
          <TaskAttachmentList
            files={correction.files}
            plain
            submission
            compact={compactFiles}
          />
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
