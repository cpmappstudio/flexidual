"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function TaskDateValue({
  label,
  value,
  timeZone,
}: {
  label: string;
  value: number;
  timeZone: string;
}) {
  const format = useFormatter();
  return (
    <dl className="space-y-2">
      <dt className="text-sm leading-none font-medium">{label}</dt>
      <dd className="py-2 text-sm">
        {format.dateTime(value, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        })}
      </dd>
    </dl>
  );
}

export function TaskContentFields({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  disabled,
  quiz = false,
  titleError,
}: {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  disabled: boolean;
  quiz?: boolean;
  titleError?: string;
}) {
  const t = useTranslations("courseTasks");
  const q = useTranslations("courseQuizzes");
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="task-title">
          {t("title")}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="task-title"
          value={title}
          maxLength={160}
          onChange={(event) => onTitleChange(event.target.value)}
          required
          disabled={disabled}
          aria-invalid={!!titleError || undefined}
          aria-describedby={titleError ? "task-title-error" : undefined}
        />
        {titleError && (
          <p id="task-title-error" className="text-sm text-destructive">
            {titleError}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="task-description">
          {quiz ? q("studentInstructions") : t("description")}
        </Label>
        <Textarea
          id="task-description"
          value={description}
          maxLength={10_000}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={4}
          disabled={disabled}
        />
      </div>
    </>
  );
}

export function TaskDateFields({
  task,
  availableAt,
  dueAt,
  onAvailableAtChange,
  onDueAtChange,
  timeZone,
  disabled,
  quiz = false,
  closingLocked = false,
  startError,
  dueError,
}: {
  task?: Doc<"courseTasks">;
  availableAt: string;
  dueAt: string;
  onAvailableAtChange: (value: string) => void;
  onDueAtChange: (value: string) => void;
  timeZone: string;
  disabled: boolean;
  quiz?: boolean;
  closingLocked?: boolean;
  startError?: string;
  dueError?: string;
}) {
  const t = useTranslations("courseTasks");
  const q = useTranslations("courseQuizzes");
  const format = useFormatter();
  return (
    <>
      <div className="space-y-2">
        {task?.releasedAt === undefined ? (
          <>
            <Label htmlFor="task-start">{t("availableAt")}</Label>
            <Input
              id="task-start"
              type="datetime-local"
              value={availableAt}
              onChange={(event) => onAvailableAtChange(event.target.value)}
              disabled={disabled}
              aria-invalid={!!startError || undefined}
              aria-describedby={
                startError
                  ? "task-start-error"
                  : quiz && !availableAt
                    ? "task-start-hint"
                    : undefined
              }
            />
            {startError && (
              <p id="task-start-error" className="text-sm text-destructive">
                {startError}
              </p>
            )}
            {quiz && !availableAt && (
              <p id="task-start-hint" className="text-xs text-muted-foreground">
                {q("emptyStartHint")}
              </p>
            )}
            {!quiz && (
              <p className="text-xs text-muted-foreground">
                {t(availableAt ? "scheduledStartHint" : "immediateStartHint")}
              </p>
            )}
          </>
        ) : quiz ? (
          <TaskDateValue
            label={t("availableFrom")}
            value={task.releasedAt}
            timeZone={timeZone}
          />
        ) : (
          <>
            <Label>{t("availableFrom")}</Label>
            <p className="py-2 text-sm font-medium">
              {format.dateTime(task.releasedAt, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone,
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("releasedStartHint")}
            </p>
          </>
        )}
      </div>
      <div className="space-y-2">
        {quiz && closingLocked && task?.dueAt !== undefined ? (
          <>
            <TaskDateValue
              label={q("dueAt")}
              value={task.dueAt}
              timeZone={timeZone}
            />
            <p className="text-xs text-muted-foreground">
              {q("closingLocked")}
            </p>
          </>
        ) : (
          <>
            <Label htmlFor="task-due">
              {quiz ? q("dueAt") : t("dueAt")}
              {quiz && (
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              )}
            </Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => onDueAtChange(event.target.value)}
              required={quiz}
              disabled={disabled || closingLocked}
              aria-invalid={!!dueError || undefined}
              aria-describedby={
                dueError
                  ? "task-due-error"
                  : quiz && task?.releasedAt !== undefined
                    ? "task-due-hint"
                    : undefined
              }
            />
            {dueError && (
              <p id="task-due-error" className="text-sm text-destructive">
                {dueError}
              </p>
            )}
            {quiz && task?.releasedAt !== undefined && (
              <p id="task-due-hint" className="text-xs text-muted-foreground">
                {q("closingChangeHint")}
              </p>
            )}
            {!quiz && (
              <p className="text-xs text-muted-foreground">
                {t(dueAt ? "deadlineHint" : "noDeadlineHint")}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
