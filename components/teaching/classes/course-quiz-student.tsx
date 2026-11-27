"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "@clerk/nextjs";
import {
  useConvex,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  WifiOff,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  useCourseQuizAnswers,
  quizRequestError,
  type QuizRequestError,
} from "@/hooks/use-course-quiz-answers";
import { cn } from "@/lib/utils";
import { areQuizResultsAvailable } from "@/lib/course-quizzes";
import { useSessionDraft } from "@/hooks/use-session-draft";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CourseQuizAnswerQuestion } from "./course-quiz-answer-question";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { useCourseQuizCopyProtection } from "@/hooks/use-course-quiz-copy-protection";
import { CourseQuizInstructions } from "./course-quiz-definition";
import { CourseTaskSummary } from "./course-task-summary";
import { CourseTaskGrade } from "./course-task-grade";
import { CourseQuizResults } from "./course-quiz-results";

type Timing = FunctionReturnType<typeof api.courseQuizzes.start>;
type Props = { task: Doc<"courseTasks">; timeZone: string };
const CLOCK_UNCERTAINTY_MS = 5_000;
const decodeQuestionId = (value: unknown) =>
  typeof value === "string" && value.length <= 128 ? value : undefined;

function focusQuizElement(target: HTMLElement | null | undefined) {
  target?.focus({ preventScroll: true });
  target?.scrollIntoView?.({ block: "start" });
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const onlineSnapshot = () => navigator.onLine;
const onlineServerSnapshot = () => true;

export function CourseQuizStudent(props: Props) {
  const { userId } = useAuth();
  return userId ? (
    <QuizAttempt
      key={`${props.task._id}:${userId}`}
      {...props}
      userId={userId}
    />
  ) : (
    <Skeleton className="h-40 w-full" />
  );
}

function QuizAttempt({ task, timeZone, userId }: Props & { userId: string }) {
  const protectedContent = useCourseQuizCopyProtection<HTMLDivElement>();
  const t = useTranslations("courseQuizzes");
  const format = useFormatter();
  const convex = useConvex();
  const { isWebSocketConnected, connectionCount } = useConvexConnectionState();
  const browserOnline = useSyncExternalStore(
    subscribeOnline,
    onlineSnapshot,
    onlineServerSnapshot,
  );
  const connected = isWebSocketConnected && browserOnline;
  // The clock is local; autosaves do not invalidate the separate questions query.
  const queryArgs = { taskId: task._id, now: task.updatedAt };
  const result = useQuery(api.courseQuizzes.getAttempt, queryArgs);
  const data = useRetainedQueryResult(result, `${task._id}:${userId}`);
  const questionsResult = useQuery(api.courseQuizzes.getQuestions, {
    taskId: task._id,
  });
  const questions = useRetainedQueryResult(
    questionsResult,
    `${task._id}:${userId}`,
  );
  const start = useMutation(api.courseQuizzes.start);
  const [timing, setTiming] = useState<Timing>();
  const [clockNow, setClockNow] = useState<number | null>(null);
  const anchor = useRef<{
    serverNow: number;
    monotonicAt: number;
    wallAt: number;
  } | null>(null);
  const synchronizing = useRef<Promise<void> | null>(null);
  const lastConnection = useRef(connectionCount);
  const [starting, setStarting] = useState(false);
  const [clockError, setClockError] = useState<QuizRequestError | null>(null);
  const [receipt, setReceipt] = useState<{ submittedAt: number }>();
  const [confirming, setConfirming] = useState(false);
  const cursor = useSessionDraft(
    `flexidual:quiz-position:v1:${userId}:${task._id}`,
    decodeQuestionId,
  );
  const currentIndex = Math.max(
    0,
    questions?.findIndex((question) => question._id === cursor.draft) ?? 0,
  );
  const currentQuestion = questions?.[currentIndex];
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const section = useRef<HTMLElement>(null);
  const measureToolbar = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () =>
      section.current?.style.setProperty(
        "--quiz-toolbar-height",
        `${node.offsetHeight}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const attempt = data?.attempt ?? timing;
  const submittedAt =
    data?.attempt?.submittedAt ?? timing?.submittedAt ?? receipt?.submittedAt;
  const completed = submittedAt !== undefined;
  const endsAt =
    attempt && data
      ? Math.min(attempt.timeLimitAt, task.dueAt ?? data.dueAt)
      : undefined;
  const remaining =
    task.quiz?.closedAt !== undefined && attempt
      ? 0
      : endsAt === undefined || clockNow === null
        ? null
        : Math.max(0, Math.ceil((endsAt - clockNow) / 1_000));
  const expired = remaining === 0;
  const enabled =
    !!attempt &&
    !completed &&
    questions !== undefined &&
    remaining !== null &&
    remaining > 0 &&
    clockError === null;
  const drafts = useCourseQuizAnswers({
    taskId: task._id,
    answers: data?.answers ?? [],
    enabled,
    connected,
    completed,
    storageKey: `flexidual:quiz-answers:v1:${userId}:${task._id}`,
  });

  const synchronize = useCallback((): Promise<void> => {
    if (synchronizing.current) return synchronizing.current;
    const request = (async () => {
      try {
        let sentAt = performance.now();
        let sample = await start({ taskId: task._id });
        // A response held during disconnection is not a fresh clock sample.
        if (
          performance.now() - sentAt > CLOCK_UNCERTAINTY_MS &&
          sample.submittedAt === undefined
        ) {
          sentAt = performance.now();
          sample = await start({ taskId: task._id });
          if (performance.now() - sentAt > CLOCK_UNCERTAINTY_MS)
            throw new Error("CLOCK_SYNC_DELAYED");
        }
        const receivedAt = performance.now();
        // Count the full round trip so latency cannot grant apparent extra time.
        const serverNow = sample.serverNow + receivedAt - sentAt;
        anchor.current = {
          serverNow,
          monotonicAt: receivedAt,
          wallAt: Date.now(),
        };
        setClockNow(serverNow);
        setTiming(sample);
        setClockError(null);
      } catch (cause) {
        setClockError(quizRequestError(cause));
      } finally {
        synchronizing.current = null;
      }
    })();
    synchronizing.current = request;
    return request;
  }, [start, task._id]);

  const startedAt = attempt?.startedAt;
  useEffect(() => {
    if (startedAt === undefined || completed) return;
    if (!connected) lastConnection.current = -1;
    if (
      connected &&
      (!anchor.current || lastConnection.current !== connectionCount)
    ) {
      lastConnection.current = connectionCount;
      void synchronize();
    }
    const timer = window.setInterval(() => {
      // Some devices stop the monotonic clock during sleep; resync before allowing more edits.
      if (
        !connected &&
        anchor.current &&
        Math.abs(
          Date.now() -
            anchor.current.wallAt -
            (performance.now() - anchor.current.monotonicAt),
        ) > CLOCK_UNCERTAINTY_MS
      ) {
        setClockNow(null);
        setClockError("save");
      } else if (anchor.current)
        setClockNow(
          anchor.current.serverNow +
            performance.now() -
            anchor.current.monotonicAt,
        );
    }, 1_000);
    const resume = () => {
      if (connected && document.visibilityState === "visible")
        void synchronize();
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [startedAt, completed, connected, connectionCount, synchronize]);

  const stage =
    data === undefined || questions === undefined
      ? null
      : completed
        ? "submitted"
        : attempt
          ? "answering"
          : "overview";
  useEffect(() => {
    const target =
      stage === "submitted"
        ? receiptHeading.current
        : stage === "answering"
          ? (section.current?.querySelector<HTMLElement>(
              "[data-quiz-question]",
            ) ?? section.current)
          : startButton.current;
    focusQuizElement(target);
  }, [stage, currentQuestion?._id]);

  if (data === undefined || questions === undefined)
    return <Skeleton className="h-56 w-full" />;
  const answeredIds = new Set(
    questions
      .filter((question) => {
        const answer = drafts.answerFor(question._id);
        return answer?.kind === "text"
          ? !!answer.text.trim()
          : answer?.kind === "single_choice"
            ? answer.optionId !== null
            : answer?.kind === "multiple_choice" && answer.optionIds.length > 0;
      })
      .map((question) => question._id),
  );
  const answered = answeredIds.size;
  const pendingQuestions = questions.filter(
    (question) => !answeredIds.has(question._id),
  );
  function goTo(questionId: string) {
    if (questionId === currentQuestion?._id) {
      const target = section.current?.querySelector<HTMLElement>(
        "[data-quiz-question]",
      );
      focusQuizElement(target);
    }
    cursor.setDraft(questionId);
    setNavigatorOpen(false);
  }

  const clockText =
    remaining === null
      ? "—"
      : [
          ...(remaining >= 3_600 ? [Math.floor(remaining / 3_600)] : []),
          Math.floor(remaining / 60) % 60,
          remaining % 60,
        ]
          .map((part) => String(part).padStart(2, "0"))
          .join(":");
  const blockedStart =
    task.quiz?.closedAt !== undefined ||
    clockError === "expired" ||
    clockError === "access";

  async function begin() {
    if (starting || !connected) return;
    setStarting(true);
    try {
      await synchronize();
    } finally {
      setStarting(false);
    }
  }
  async function deliver() {
    const result = await drafts.submit();
    if (result) setReceipt(result);
    setConfirming(false);
  }

  const connectionFeedback = (
    <>
      {!completed && !connected && (
        <p
          role="status"
          className="flex items-start gap-2 text-sm text-warning-foreground"
        >
          <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("offlineHint")}
        </p>
      )}
      {!completed && clockError && clockError !== "expired" && (
        <div role="alert" className="space-y-2 text-sm">
          <p>
            {t(
              clockError === "access"
                ? "accessLost"
                : attempt
                  ? "clockSyncError"
                  : "startError",
            )}
          </p>
          {clockError !== "access" && attempt && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={!connected}
              onClick={() => void synchronize()}
            >
              {t("retryClock")}
            </Button>
          )}
        </div>
      )}
    </>
  );

  return (
    <section
      ref={section}
      tabIndex={-1}
      className="min-w-0 scroll-mt-[calc(var(--header-height,4rem)+1rem)] space-y-5 outline-none"
      aria-label={t("studentQuiz")}
      data-quiz-active={stage === "answering" ? "true" : undefined}
    >
      {completed ? (
        <>
          <div role="status" className="flex items-start gap-3">
            <Check
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h4
                ref={receiptHeading}
                tabIndex={-1}
                className="scroll-mt-[calc(var(--header-height,4rem)+1rem)] font-semibold outline-none"
              >
                {t("attemptSubmitted")}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t("submittedAt", {
                  date: format.dateTime(submittedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone,
                  }),
                })}
              </p>
            </div>
          </div>
          <CourseTaskGrade
            taskId={task._id}
            timeZone={timeZone}
            unpublishedContent={
              areQuizResultsAvailable(task) ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("gradePending")}
                </p>
              ) : undefined
            }
          />
          <CourseQuizResults task={task} timeZone={timeZone} />
        </>
      ) : !attempt ? (
        <>
          <CourseTaskSummary task={task} timeZone={timeZone} />
          <CourseQuizInstructions description={task.description} />
          <p className="text-sm">
            {t(blockedStart ? "quizClosed" : "startRules")}
          </p>
          {!blockedStart && (
            <Button
              ref={startButton}
              type="button"
              className="min-h-11"
              disabled={starting || !connected}
              onClick={() => void begin()}
            >
              {starting && <Spinner aria-hidden="true" />}
              {t("startQuiz")}
            </Button>
          )}
        </>
      ) : (
        <>
          <h2 className="min-w-0 break-words text-xl font-semibold [overflow-wrap:anywhere]">
            {task.title}
          </h2>
          <div
            ref={measureToolbar}
            className="sticky top-(--header-height,4rem) z-20 space-y-2 border-b bg-background py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Clock3 className="size-4 text-primary" aria-hidden="true" />
                  {t("timeRemaining")}
                </p>
                <span
                  role="timer"
                  aria-live="off"
                  aria-label={t("timeRemaining")}
                  className="text-3xl font-bold tabular-nums"
                >
                  {clockText}
                </span>
              </div>
              {!expired && (
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={
                    !enabled ||
                    !connected ||
                    drafts.submitting ||
                    !!drafts.error ||
                    questions.length === 0
                  }
                  onClick={() => setConfirming(true)}
                >
                  {drafts.submitting && <Spinner aria-hidden="true" />}
                  {t("submitQuiz")}
                </Button>
              )}
            </div>
            {remaining === null && (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Spinner aria-hidden="true" />
                {t("syncingClock")}
              </p>
            )}
            {expired ? (
              <p role="status" className="text-sm font-medium">
                {t("timeExpiredHint")}
              </p>
            ) : (
              remaining !== null &&
              remaining <= 60 && (
                <p
                  role="status"
                  className="text-sm font-medium text-warning-foreground"
                >
                  {t("oneMinuteLeft")}
                </p>
              )
            )}
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t("answeredCount", {
                  count: answered,
                  total: questions.length,
                })}
              </p>
              <p role="status" className="text-sm text-muted-foreground">
                {t(
                  drafts.saving && connected && !expired
                    ? "savingAnswers"
                    : drafts.hasPending
                      ? "unsavedAnswers"
                      : "answersSaved",
                )}
              </p>
            </div>
          </div>
          {connectionFeedback}
          <Collapsible open={navigatorOpen} onOpenChange={setNavigatorOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 px-0 has-[>svg]:px-0"
              >
                {t("questionNavigator")}
                <ChevronDown
                  aria-hidden="true"
                  className={cn("size-4", navigatorOpen && "rotate-180")}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <p className="text-sm text-foreground/80">
                {t("questionNavigatorHint")}
              </p>
              <nav
                aria-label={t("questionNavigator")}
                className="flex flex-wrap gap-2"
              >
                {questions.map((question, index) => (
                  <Button
                    key={question._id}
                    type="button"
                    variant="outline"
                    className={cn(
                      "size-11 p-0",
                      answeredIds.has(question._id) && "bg-muted",
                      index === currentIndex &&
                        "border-primary ring-2 ring-primary/30",
                    )}
                    aria-current={index === currentIndex ? "step" : undefined}
                    aria-label={t("navigateQuestion", {
                      number: index + 1,
                      status: t(
                        answeredIds.has(question._id)
                          ? "answered"
                          : "unanswered",
                      ),
                    })}
                    disabled={drafts.submitting}
                    onClick={() => goTo(question._id)}
                  >
                    {index + 1}
                    {answeredIds.has(question._id) && (
                      <Check className="size-3" aria-hidden="true" />
                    )}
                  </Button>
                ))}
              </nav>
            </CollapsibleContent>
          </Collapsible>
          <CourseQuizInstructions description={task.description} collapsible />
          {drafts.error && (
            <div
              role="alert"
              className="space-y-3 rounded-md border border-destructive/30 p-3 text-sm"
            >
              <p>
                {t(
                  drafts.error === "conflict"
                    ? "answerConflict"
                    : drafts.error === "expired"
                      ? "timeExpiredHint"
                      : drafts.error === "access"
                        ? "accessLost"
                        : "answerSaveError",
                )}
              </p>
              {drafts.error === "conflict" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={!connected || !enabled}
                  onClick={() =>
                    void drafts.loadSaved(
                      async () =>
                        (
                          await convex.query(
                            api.courseQuizzes.getAttempt,
                            queryArgs,
                          )
                        ).answers,
                    )
                  }
                >
                  {t("loadSavedAnswers")}
                </Button>
              ) : (
                drafts.error === "save" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={!connected || !enabled}
                    onClick={drafts.retry}
                  >
                    {t("retrySave")}
                  </Button>
                )
              )}
            </div>
          )}
          <div ref={protectedContent} className="space-y-6 select-none">
            {currentQuestion && (
              <CourseQuizAnswerQuestion
                key={currentQuestion._id}
                question={currentQuestion}
                index={currentIndex}
                answer={drafts.answerFor(currentQuestion._id)}
                disabled={!enabled || drafts.submitting}
                onChange={(answer) => drafts.edit(currentQuestion._id, answer)}
              />
            )}
          </div>
          <div className="grid grid-cols-2 items-center gap-3 border-t pt-4 sm:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 justify-self-start"
              disabled={
                !currentQuestion || currentIndex === 0 || drafts.submitting
              }
              onClick={() => goTo(questions[currentIndex - 1]._id)}
            >
              <ArrowLeft aria-hidden="true" />
              {t("previousQuestion")}
            </Button>
            <span className="order-first col-span-2 text-center text-sm text-foreground/80 sm:order-none sm:col-span-1">
              {t("questionPosition", {
                number: currentQuestion ? currentIndex + 1 : 0,
                total: questions.length,
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 justify-self-end"
              disabled={
                !currentQuestion ||
                currentIndex >= questions.length - 1 ||
                drafts.submitting
              }
              onClick={() => goTo(questions[currentIndex + 1]._id)}
            >
              {t("nextQuestion")}
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
      {!attempt && connectionFeedback}
      <AlertDialog
        open={confirming && !completed && !expired}
        onOpenChange={(open) => {
          if (!drafts.submitting) setConfirming(open);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target =
              receiptHeading.current ??
              section.current?.querySelector<HTMLElement>(
                "[data-quiz-question]",
              );
            focusQuizElement(target);
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmSubmitTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmSubmitHint", {
                count: answered,
                total: questions.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingQuestions.length > 0 && (
            <nav
              aria-label={t("pendingQuestions")}
              className="flex max-h-40 flex-wrap gap-2 overflow-y-auto"
            >
              {questions.map(
                (question, index) =>
                  !answeredIds.has(question._id) && (
                    <Button
                      key={question._id}
                      type="button"
                      variant="outline"
                      className="size-11 p-0"
                      aria-label={t("navigateQuestion", {
                        number: index + 1,
                        status: t("unanswered"),
                      })}
                      disabled={drafts.submitting}
                      onClick={() => {
                        setConfirming(false);
                        goTo(question._id);
                      }}
                    >
                      {index + 1}
                    </Button>
                  ),
              )}
            </nav>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={drafts.submitting}>
              {t("keepAnswering")}
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={
                !enabled || !connected || drafts.submitting || !!drafts.error
              }
              onClick={() => void deliver()}
            >
              {drafts.submitting && <Spinner aria-hidden="true" />}
              {t("confirmSubmit")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
