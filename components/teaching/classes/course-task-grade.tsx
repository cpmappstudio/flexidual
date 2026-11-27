"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ClipboardCheck } from "lucide-react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useTaskGradeDraft,
  type TaskGradeDraft,
} from "@/hooks/use-task-grade-draft";
import {
  gradeOutcome,
  gradeToScale,
  isValidPoints,
  sameGradingConfiguration,
  type GradingConfiguration,
} from "@/lib/grading";

export function GradeValue({
  points,
  grading,
  institutionalPoints,
  showPoints = true,
}: {
  points: number;
  grading: GradingConfiguration;
  institutionalPoints?: number;
  showPoints?: boolean;
}) {
  const format = useFormatter();
  const t = useTranslations("grading");
  const outcome = gradeOutcome(
    institutionalPoints ?? points,
    grading,
    institutionalPoints === undefined ? undefined : true,
  );
  if (!showPoints && !outcome) return null;
  const number = (value: number) =>
    format.number(value, { maximumFractionDigits: grading.decimalPlaces });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {showPoints && (
        <span className="font-semibold tabular-nums">
          {number(institutionalPoints ?? gradeToScale(points, grading))} /{" "}
          {number(grading.scaleMax)}
        </span>
      )}
      {outcome && (
        <Badge variant={outcome === "passed" ? "active" : "destructive"}>
          {t(outcome)}
        </Badge>
      )}
    </span>
  );
}

export function CourseTaskGrade({
  taskId,
  studentId,
  submissionRevision,
  timeZone,
  unpublishedContent,
}: {
  taskId: Id<"courseTasks">;
  studentId?: Id<"users">;
  submissionRevision?: number;
  timeZone: string;
  unpublishedContent?: ReactNode;
}) {
  const t = useTranslations("grading");
  const format = useFormatter();
  const grade = useQuery(api.courseTaskGrades.get, {
    taskId,
    ...(studentId ? { studentId } : {}),
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  if (grade === undefined) return <Skeleton className="h-24 w-full" />;
  if (!grade.grading) return null;
  if (!studentId && !grade.published) return unpublishedContent ?? null;
  return (
    <section className="grid gap-3 border-t pt-5" aria-label={t("title")}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
        {t("title")}
      </h3>
      {grade.published && (
        <div className="space-y-1">
          <GradeValue
            points={grade.published.points}
            grading={grade.grading}
            institutionalPoints={grade.published.institutionalPoints}
            showPoints={!studentId}
          />
          <p className="text-xs text-muted-foreground">
            {t("publishedAt", {
              date: format.dateTime(grade.published.updatedAt, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone,
              }),
            })}
          </p>
          {grade.published.comment && (
            <p className="whitespace-pre-wrap break-words text-sm">
              {grade.published.comment}
            </p>
          )}
        </div>
      )}
      {grade.needsReview && (
        <p className="text-sm text-muted-foreground">{t("newSubmission")}</p>
      )}
      {studentId && (
        <>
          <GradeEditor
            key={`${taskId}:${studentId}`}
            taskId={taskId}
            studentId={studentId}
            submissionRevision={submissionRevision ?? 0}
            grade={grade}
          />
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(!historyOpen)}
              aria-expanded={historyOpen}
            >
              {t("history")}
            </Button>
          </div>
          {historyOpen && (
            <GradeHistory
              taskId={taskId}
              studentId={studentId}
              grading={grade.grading}
              timeZone={timeZone}
            />
          )}
        </>
      )}
    </section>
  );
}

export type GradeActions = {
  busy: boolean;
  canSave: boolean;
  canPublish: boolean;
  saveDraft: () => Promise<boolean>;
  publish: (beforePublish?: () => Promise<boolean>) => Promise<boolean>;
};

function GradeEditorActions({
  render,
  ...actions
}: GradeActions & { render: NonNullable<GradeEditorProps["renderActions"]> }) {
  return render(actions);
}

type GradeEditorProps = {
  taskId: Id<"courseTasks">;
  studentId: Id<"users">;
  submissionRevision: number;
  grade: FunctionReturnType<typeof api.courseTaskGrades.get>;
  compact?: boolean;
  studentName?: string;
  renderActions?: (actions: GradeActions) => ReactNode;
};

export function GradeEditor({
  taskId,
  studentId,
  submissionRevision,
  grade,
  compact = false,
  studentName,
  renderActions,
}: GradeEditorProps) {
  const t = useTranslations("grading");
  const saveDraft = useMutation(api.courseTaskGrades.saveDraft);
  const publish = useMutation(api.courseTaskGrades.publish);
  const { draft, setDraft, clearDraftIf } = useTaskGradeDraft(
    taskId,
    studentId,
  );
  const pointsId = useId();
  const commentId = useId();
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [pendingVersion, setPendingVersion] = useState(0);
  const publishOperation = useRef<{ version: number; id: string } | undefined>(
    undefined,
  );
  const saved = grade.draft ?? grade.published;
  const savedPoints = saved
    ? String(saved.institutionalPoints ?? saved.points)
    : "";
  const savedInstitutionalScale =
    saved?.institutionalPoints === undefined ? undefined : true;
  const points = draft?.points ?? savedPoints;
  const institutionalScale = draft
    ? draft.institutionalScale
    : savedInstitutionalScale;
  const comment = draft?.comment ?? saved?.comment ?? "";
  const grading = draft?.grading ?? grade.grading;
  const valid =
    !!grading &&
    points.trim() !== "" &&
    isValidPoints(
      Number(points),
      institutionalScale ? grading.scaleMax : grading.maxPoints,
      grading.decimalPlaces,
    );
  const displayedPoints =
    valid && !institutionalScale && (!draft || draft.grading)
      ? String(gradeToScale(Number(points), grading))
      : points;
  const draftContextChanged =
    !!draft &&
    (draft.submissionRevision !== submissionRevision ||
      !sameGradingConfiguration(draft.grading, grade.grading));
  const hasChanges =
    (points !== savedPoints &&
      (points.trim() === "" ||
        savedPoints === "" ||
        Number(points) !== Number(savedPoints))) ||
    institutionalScale !== savedInstitutionalScale ||
    comment.trim() !== (saved?.comment ?? "");
  const recoveredConfirmation =
    !!draft &&
    !draftContextChanged &&
    !hasChanges &&
    saved?.submissionRevision === submissionRevision &&
    draft.version < grade.version;
  const stale =
    !!draft &&
    (draftContextChanged ||
      (draft.version !== grade.version && !recoveredConfirmation));
  const canKeepDraft = stale && !draftContextChanged;
  const clearConfirmedDraft = useEffectEvent((operationId: string) => {
    clearDraftIf((current) => current.operationId === operationId);
  });
  useEffect(() => {
    if (recoveredConfirmation && draft) clearConfirmedDraft(draft.operationId);
  }, [recoveredConfirmation, draft]);
  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);
  const needsCurrentRevision =
    !!saved && saved.submissionRevision !== submissionRevision;
  const waiting = grade.version < pendingVersion;
  const canSave =
    !busy &&
    !waiting &&
    !stale &&
    valid &&
    (hasChanges ||
      ((!compact || Boolean(renderActions)) && needsCurrentRevision));
  const canPublish =
    !busy &&
    !waiting &&
    !stale &&
    !hasChanges &&
    grade.draft?.submissionRevision === submissionRevision;

  function edit(
    patch: Partial<
      Pick<TaskGradeDraft, "points" | "institutionalScale" | "comment">
    >,
  ) {
    if (!grade.grading) return;
    setSaveFailed(false);
    if (patch.points === "" && !saved && !comment.trim()) {
      setDraft(undefined);
      return;
    }
    setDraft({
      points,
      institutionalScale,
      comment,
      version: grade.version,
      submissionRevision,
      grading: { ...grade.grading },
      ...(recoveredConfirmation ? undefined : draft),
      ...patch,
      operationId: crypto.randomUUID(),
    });
  }

  async function mutate(
    kind: "save" | "publish",
    beforePublish?: () => Promise<boolean>,
  ) {
    if (
      inFlight.current ||
      !grading ||
      !(kind === "save" ? canSave : canPublish)
    )
      return false;
    inFlight.current = true;
    setBusy(true);
    try {
      let version: number;
      if (kind === "save") {
        const operationId = draft?.operationId ?? crypto.randomUUID();
        version = await saveDraft({
          taskId,
          studentId,
          ...(institutionalScale
            ? { institutionalPoints: Number(points) }
            : { points: Number(points) }),
          comment: comment.trim() || undefined,
          expectedVersion: draft?.version ?? grade.version,
          expectedSubmissionRevision:
            draft?.submissionRevision ?? submissionRevision,
          expectedGrading: grading,
          operationId,
        });
        clearDraftIf((current) => current.operationId === operationId);
        setSaveFailed(false);
      } else {
        if (beforePublish && !(await beforePublish())) return false;
        if (publishOperation.current?.version !== grade.version)
          publishOperation.current = {
            version: grade.version,
            id: crypto.randomUUID(),
          };
        version = await publish({
          taskId,
          studentId,
          expectedVersion: grade.version,
          expectedSubmissionRevision: submissionRevision,
          expectedGrading: grading,
          operationId: publishOperation.current.id,
        });
      }
      setPendingVersion(version);
      if (kind === "publish") toast.success(t("published"));
      return true;
    } catch {
      if (kind === "save") setSaveFailed(true);
      else toast.error(t("saveError"));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const autosave = useEffectEvent(() => {
    void mutate("save");
  });
  useEffect(() => {
    if (!draft || !canSave || saveFailed) return;
    const timer = window.setTimeout(autosave, 750);
    return () => window.clearTimeout(timer);
  }, [draft, canSave, saveFailed]);

  return (
    <form
      data-pending-grade={busy || waiting || stale || hasChanges || undefined}
      className={renderActions ? "grid w-full min-w-0 gap-2" : "grid gap-3"}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          draft &&
          !saveFailed
        )
          void mutate("save");
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void mutate("save");
      }}
    >
      <div
        className={
          renderActions ? "grid gap-1 max-lg:justify-items-end" : "grid gap-2"
        }
      >
        <Label
          htmlFor={pointsId}
          className={
            studentName
              ? "sr-only"
              : renderActions
                ? "text-sm leading-normal font-normal text-muted-foreground max-lg:text-right"
                : undefined
          }
        >
          {renderActions && (
            <span className="whitespace-nowrap lg:hidden" aria-hidden="true">
              {t("title")}
            </span>
          )}
          <span className={renderActions ? "max-lg:sr-only" : undefined}>
            {studentName
              ? t("studentGrade", {
                  name: studentName,
                  max: grading?.scaleMax ?? 0,
                })
              : t("points", { max: grading?.scaleMax ?? 0 })}
          </span>
        </Label>
        <Input
          id={pointsId}
          className={
            renderActions
              ? "h-8 max-w-full px-2 lg:w-28 lg:px-3 pointer-coarse:min-h-11"
              : compact
                ? "w-28 max-w-full"
                : undefined
          }
          type="number"
          min={0}
          max={grading?.scaleMax}
          step={10 ** -(grading?.decimalPlaces ?? 2)}
          value={displayedPoints}
          onChange={(e) =>
            edit({ points: e.target.value, institutionalScale: true })
          }
          required
          aria-invalid={Boolean(draft && !valid && hasChanges)}
          readOnly={busy || waiting || stale}
        />
      </div>
      {!compact && (
        <div className="grid gap-2">
          <Label htmlFor={commentId}>{t("comment")}</Label>
          <Textarea
            id={commentId}
            rows={3}
            maxLength={2000}
            value={comment}
            onChange={(e) => edit({ comment: e.target.value })}
            readOnly={busy || waiting || stale}
          />
        </div>
      )}
      {renderActions && (
        <GradeEditorActions
          render={renderActions}
          busy={busy}
          canSave={canSave}
          canPublish={canPublish}
          saveDraft={() => mutate("save")}
          publish={(beforePublish) => mutate("publish", beforePublish)}
        />
      )}
      {stale || saveFailed ? (
        <p role="alert" className="text-xs text-destructive">
          {stale ? t(canKeepDraft ? "staleVersion" : "stale") : t("saveError")}
        </p>
      ) : (
        (busy || waiting) && (
          <p role="status" className="sr-only">
            {t("savingDraft")}
          </p>
        )
      )}
      {(!compact || stale || saveFailed) && (
        <div
          className={
            renderActions
              ? "flex flex-wrap justify-end gap-2 max-lg:[&>button]:h-auto max-lg:[&>button]:min-h-9 max-lg:[&>button]:max-w-full max-lg:[&>button]:whitespace-normal"
              : "flex flex-wrap gap-2 sm:justify-end"
          }
        >
          {draft && stale && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setDraft(undefined)}
            >
              {t("loadCurrent")}
            </Button>
          )}
          {draft && canKeepDraft && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || waiting}
              onClick={() =>
                setDraft({
                  ...draft,
                  version: grade.version,
                  operationId: crypto.randomUUID(),
                })
              }
            >
              {t("keepLocalDraft")}
            </Button>
          )}
          {(saveFailed || (!compact && !draft && needsCurrentRevision)) && (
            <Button type="submit" variant="outline" disabled={!canSave}>
              {t(saveFailed ? "retryDraft" : "saveForCurrentSubmission")}
            </Button>
          )}
          {!compact && (
            <Button
              type="button"
              disabled={!canPublish}
              onClick={() => void mutate("publish")}
            >
              {t("publish")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

export function GradeHistory({
  taskId,
  studentId,
  grading,
  timeZone,
}: {
  taskId: Id<"courseTasks">;
  studentId: Id<"users">;
  grading: GradingConfiguration;
  timeZone: string;
}) {
  const t = useTranslations("grading");
  const format = useFormatter();
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseTaskGrades.history,
    { taskId, studentId },
    { initialNumItems: 10 },
  );
  return (
    <div className="grid gap-2 text-sm">
      {results.map((entry) => (
        <div key={entry.version} className="space-y-1 border-b pb-2">
          <p>
            <GradeValue
              points={entry.points}
              grading={grading}
              institutionalPoints={entry.institutionalPoints}
            />
          </p>
          <p className="text-xs text-muted-foreground">
            {format.dateTime(entry.updatedAt, {
              dateStyle: "short",
              timeStyle: "short",
              timeZone,
            })}
          </p>
          {entry.comment && (
            <p className="whitespace-pre-wrap break-words">{entry.comment}</p>
          )}
        </div>
      ))}
      {status === "LoadingFirstPage" && <Skeleton className="h-12" />}
      {status === "Exhausted" && !results.length && <p>{t("noHistory")}</p>}
      {status === "CanLoadMore" && (
        <Button type="button" variant="outline" onClick={() => loadMore(10)}>
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
