"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { useQueries } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getSessionRecordings,
  SessionRecordView,
  type SessionRecordData,
} from "@/components/classroom/session-record";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

const list = api.adminSessionDashboard.listReviewSessions;
const detail = api.adminSessionDashboard.getReviewRecord;
const RecordingPlayerModal = dynamic(() =>
  import("@/components/recording-player-modal").then(
    (m) => m.RecordingPlayerModal,
  ),
);
const SessionCloseoutDialog = dynamic(() =>
  import("@/components/classroom/session-closeout-dialog").then(
    (m) => m.SessionCloseoutDialog,
  ),
);
type Result = FunctionReturnType<typeof list>;
type Row = Result["rows"][number];
type Scope = Omit<FunctionArgs<typeof list>, "cursor">;
type RecordScope = Omit<FunctionArgs<typeof detail>, "scheduleId">;

export function AdminSessionReview({
  scope,
  focusFallback,
}: {
  scope: Scope;
  focusFallback: RefObject<HTMLHeadingElement | null>;
}) {
  const t = useTranslations("adminDashboard");
  const format = useFormatter();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [selected, setSelected] = useState<Row>();
  const trigger = useRef<HTMLButtonElement>(null);
  const cursor = cursors.at(-1) ?? null;
  const reviewRequest = useMemo(
    () => ({ review: { query: list, args: { ...scope, cursor } } }),
    [scope, cursor],
  );
  const { review } = useQueries(reviewRequest) as { review?: Result | Error };
  const { academicPeriodId, campusId, classId } = scope;
  const recordScope = useMemo(
    () => ({
      academicPeriodId,
      ...(campusId ? { campusId } : {}),
      ...(classId ? { classId } : {}),
    }),
    [academicPeriodId, campusId, classId],
  );

  if (!review)
    return <Skeleton className="h-24 w-full" aria-label={t("reviewLoading")} />;

  const result = review instanceof Error ? undefined : review;
  const nextCursor = result?.nextCursor;
  return (
    <div className="space-y-3">
      {!result ? (
        <p role="alert">{t("reviewLoadError")}</p>
      ) : result.rows.length ? (
        <ul className="divide-y divide-border">
          {result.rows.map((row) => (
            <li
              key={row.scheduleId}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{row.className}</p>
                <p className="text-sm text-muted-foreground">
                  {format.dateTime(new Date(row.start), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: result.timeZone,
                  })}
                  {" · "}
                  {t(row.reason)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setSelected(row);
                }}
              >
                {t("reviewOpen")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            nextCursor || cursors.length > 1
              ? "reviewEmptyPage"
              : "reviewEmpty",
          )}
        </p>
      )}
      {(cursors.length > 1 || nextCursor) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={cursors.length === 1}
            onClick={() => setCursors((current) => current.slice(0, -1))}
          >
            {t("reviewPrevious")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!nextCursor}
            onClick={() =>
              nextCursor && setCursors((current) => [...current, nextCursor])
            }
          >
            {t("reviewNext")}
          </Button>
        </div>
      )}
      {selected && result && (
        <ReviewDetail
          key={selected.scheduleId}
          row={selected}
          timeZone={result.timeZone}
          scope={recordScope}
          onClose={() => setSelected(undefined)}
          restoreFocus={() => {
            const button = trigger.current;
            (button?.isConnected ? button : focusFallback.current)?.focus();
          }}
        />
      )}
    </div>
  );
}

function ReviewDetail({
  row,
  scope,
  timeZone,
  onClose,
  restoreFocus,
}: {
  row: Row;
  scope: RecordScope;
  timeZone: string;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [recordingOpen, setRecordingOpen] = useState(false);
  const recordRequest = useMemo(
    () => ({
      record: { query: detail, args: { ...scope, scheduleId: row.scheduleId } },
    }),
    [scope, row.scheduleId],
  );
  const { record } = useQueries(recordRequest) as {
    record?: SessionRecordData | Error;
  };
  const recordings = getSessionRecordings(
    record instanceof Error ? undefined : record,
  );

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{row.className}</DialogTitle>
            <DialogDescription>
              {format.dateTime(new Date(row.start), {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone,
              })}
            </DialogDescription>
          </DialogHeader>
          {record instanceof Error ? (
            <p role="alert">{t("adminDashboard.reviewLoadError")}</p>
          ) : (
            <SessionRecordView
              record={record}
              onWatchRecording={() => setRecordingOpen(true)}
              onCompleteReport={() => setCloseoutOpen(true)}
              showOwnAttendance={false}
              allowAttendanceEditing
            />
          )}
        </DialogContent>
      </Dialog>
      {recordingOpen && recordings.length > 0 && (
        <RecordingPlayerModal
          scheduleId={row.scheduleId}
          title={row.className}
          scheduledStart={row.start}
          scheduledEnd={row.end}
          timeZone={timeZone}
          open
          onOpenChange={setRecordingOpen}
          recordings={recordings}
        />
      )}
      {closeoutOpen && (
        <SessionCloseoutDialog
          open
          roomName={row.roomName}
          sessionNow={row.end}
          alreadyEnded
          onOpenChange={setCloseoutOpen}
          onComplete={() => {
            setCloseoutOpen(false);
            toast.success(t("classroom.closeout.recoverySaved"));
          }}
        />
      )}
    </>
  );
}
