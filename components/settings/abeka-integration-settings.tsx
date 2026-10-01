"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type FormEvent,
  type ComponentProps,
} from "react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { FunctionReturnType } from "convex/server";
import { useAuth } from "@clerk/nextjs";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { AbekaCourseReport } from "@/components/abeka/abeka-course-report";
import {
  RefreshCw,
  Unplug,
  KeyRound,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { DataTable } from "@/components/table/data-table";
import { TableResultCount } from "@/components/table/table-result-count";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import {
  AbekaLogo,
  AbekaStatusBadge,
  AbekaLoading,
} from "./abeka-integration-item";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import { AbekaSignInForm } from "./abeka-login-probe";
import { AbekaSyncSchedule } from "./abeka-sync-schedule";
import { AbekaCourses } from "./abeka-courses";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const pendingSyncClassName =
  "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200";

export function AbekaIntegrationSettings() {
  const t = useTranslations("settings.integrations");
  const { context, isLoading } = useSettingsContext();
  if (isLoading) return <AbekaLoading />;
  if (!context?.canManageInstitution)
    return <p className="text-sm text-muted-foreground">{t("adminOnly")}</p>;
  return (
    <section
      className="grid min-w-0 grid-cols-1 gap-6"
      aria-labelledby="abeka-title"
    >
      <AbekaIntegration schoolId={context.institution._id} />
    </section>
  );
}

function AbekaIntegration({ schoolId }: { schoolId: Id<"schools"> }) {
  const t = useTranslations("settings.integrations");
  const common = useTranslations("common");
  const format = useFormatter();
  const state = useQuery(api.abeka.status, { schoolId });
  // Share the paginated roster between the header indicator and the table.
  const {
    results: students,
    status: studentsStatus,
    loadMore,
  } = usePaginatedQuery(
    api.abeka.students,
    state?.connection?.confirmed ? { schoolId } : "skip",
    { initialNumItems: 25 },
  );
  useEffect(() => {
    if (studentsStatus === "CanLoadMore") loadMore(25);
  }, [studentsStatus, loadMore]);
  const sync = useMutation(api.abeka.syncNow);
  const disconnect = useMutation(api.abeka.disconnect);
  const confirm = useMutation(api.abeka.confirm);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "sync" | "confirm" | "disconnect" | null
  >(null);
  const busy = pendingAction !== null;
  if (!state) return <AbekaLoading />;
  const { connection, run } = state;
  const running = run?.status === "running";
  const disconnected = !connection || connection.status === "disconnected";
  const needsCredentials =
    connection?.status === "needs_reconnect" && !state.hasCredentials;
  const connectLabel =
    disconnected || needsCredentials ? t("connect") : t("updateData");
  const hasPendingStudents = students.some(
    (student) => student.available && student.linkedName && student.syncPending,
  );
  const date = (value?: number) =>
    value
      ? format.dateTime(value, { dateStyle: "medium", timeStyle: "short" })
      : t("never");
  async function perform(
    name: NonNullable<typeof pendingAction>,
    action: () => Promise<unknown>,
  ) {
    setPendingAction(name);
    try {
      await action();
    } catch (error) {
      const syncCooldown =
        name === "sync" &&
        error instanceof ConvexError &&
        error.data === "SYNC_COOLDOWN";
      toast.error(t(syncCooldown ? "syncActionError" : "actionError"));
    } finally {
      setPendingAction(null);
    }
  }
  return (
    <AlertDialog
      open={disconnecting}
      onOpenChange={(open) => {
        if (!busy) setDisconnecting(open);
      }}
    >
      <div className="min-w-0 space-y-6">
        <header className="grid min-w-0 grid-cols-1 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <AbekaLogo status={connection?.status} />
              <h2 id="abeka-title" className="text-xl font-semibold">
                Abeka
              </h2>
              <AbekaStatusBadge status={connection?.status} running={running} />
            </div>
            <div
              className="ml-auto flex shrink-0 items-center gap-2"
              role="group"
              aria-label={t("actions")}
            >
              <AbekaIconAction
                label={connectLabel}
                tooltip={
                  hasPendingStudents && !disconnected && !needsCredentials
                    ? t("pendingSync")
                    : undefined
                }
                className={
                  hasPendingStudents && !disconnected && !needsCredentials
                    ? pendingSyncClassName
                    : undefined
                }
                icon={disconnected ? Plug : RefreshCw}
                loading={pendingAction === "sync" || running}
                disabled={
                  busy || running || connection?.status === "needs_confirmation"
                }
                onClick={() => {
                  if (!disconnected && !needsCredentials)
                    void perform("sync", () => sync({ schoolId }));
                  else setConnecting(true);
                }}
              />
              <AlertDialogTrigger asChild>
                <AbekaIconAction
                  label={t("disconnect")}
                  icon={Unplug}
                  loading={pendingAction === "disconnect"}
                  disabled={busy || disconnected}
                />
              </AlertDialogTrigger>
              <AbekaIconAction
                label={t("credentials.replace")}
                icon={KeyRound}
                disabled={busy || running}
                onClick={() => setConnecting(true)}
              />
            </div>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">
            {connection?.externalSchoolName && (
              <p className="font-medium text-foreground">
                {connection.externalSchoolName} · {connection.externalSchoolId}
              </p>
            )}
            {connection?.confirmed && (
              <dl className="grid gap-1">
                <div className="flex flex-wrap gap-x-2">
                  <dt>{t("lastSync")}:</dt>
                  <dd>{date(connection.lastSyncedAt)}</dd>
                </div>
                <AbekaSyncSchedule
                  schoolId={schoolId}
                  schedule={state.schedule}
                  timeZone={state.scheduleTimeZone}
                  period={state.schedulePeriod}
                  nextSyncAt={connection.nextSyncAt}
                  disabled={busy || running || disconnected}
                />
              </dl>
            )}
            <details>
              <summary className="w-fit cursor-pointer rounded-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <h3 className="inline font-medium">{t("detail.title")}</h3>
              </summary>
              <dl className="mt-3 grid max-w-3xl gap-3">
                {(["scope", "schedule", "matching", "retention"] as const).map(
                  (key) => (
                    <div key={key}>
                      <dt className="font-medium text-foreground">
                        {t(`detail.${key}.title`)}
                      </dt>
                      <dd className="mt-1">{t(`detail.${key}.description`)}</dd>
                    </div>
                  ),
                )}
              </dl>
              {state.hasCredentials && (
                <p className="mt-3">{t("credentials.saved")}</p>
              )}
            </details>
          </div>
          {connection?.status === "needs_confirmation" && (
            <div className="grid justify-items-start gap-3">
              <p className="text-sm text-muted-foreground">
                {t("confirmSchool")}
              </p>
              <Button
                disabled={busy || running}
                onClick={() =>
                  perform("confirm", () =>
                    confirm({
                      schoolId,
                      externalSchoolId: connection.externalSchoolId!,
                    }),
                  )
                }
              >
                {pendingAction === "confirm" && (
                  <Spinner aria-label={t("loading")} />
                )}
                {t("confirm")}
              </Button>
            </div>
          )}
          {connection?.errorCode && !disconnected && (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${connection.errorCode}`)}
            </p>
          )}
          {running && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Spinner aria-hidden="true" />
              {run.catalog
                ? t("courses.running")
                : t("syncProgress", { count: run.studentsSynced })}
            </p>
          )}
        </header>
        <Dialog open={connecting} onOpenChange={setConnecting}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("connect")}</DialogTitle>
              <DialogDescription>
                {t("credentials.description")}
              </DialogDescription>
            </DialogHeader>
            <AbekaSignInForm
              schoolId={schoolId}
              onAccepted={() => setConnecting(false)}
            />
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {t("credentials.manual")}
              </summary>
              <SessionForm
                schoolId={schoolId}
                onAccepted={() => setConnecting(false)}
              />
            </details>
          </DialogContent>
        </Dialog>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disconnect")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("disconnectExplanation")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {common("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void perform("disconnect", async () => {
                  await disconnect({ schoolId });
                  setDisconnecting(false);
                });
              }}
            >
              {pendingAction === "disconnect" && (
                <Spinner aria-label={t("loading")} />
              )}
              {t("disconnect")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
        {connection?.confirmed && (
          <AbekaStudents
            schoolId={schoolId}
            students={students}
            loaded={studentsStatus === "Exhausted"}
            running={running}
            connection={connection}
          />
        )}
        {!!connection?.unavailableStudents && (
          <p className="text-sm text-muted-foreground">
            {t("unavailableStudents", {
              count: connection.unavailableStudents,
            })}
          </p>
        )}
      </div>
    </AlertDialog>
  );
}

function AbekaIconAction({
  label,
  tooltip,
  icon: Icon,
  loading = false,
  ...buttonProps
}: {
  label: string;
  tooltip?: string;
  icon: LucideIcon;
  loading?: boolean;
} & ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={label}
            aria-busy={loading}
            {...buttonProps}
          >
            {loading ? (
              <Spinner aria-hidden="true" />
            ) : (
              <Icon aria-hidden="true" />
            )}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {tooltip ?? label}
      </TooltipContent>
    </Tooltip>
  );
}

function SessionForm({
  schoolId,
  onAccepted,
}: {
  schoolId: Id<"schools">;
  onAccepted: () => void;
}) {
  const t = useTranslations("settings.integrations");
  const { getToken } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.current || busy) return;
    let cookie = input.current.value;
    input.current.value = "";
    setBusy(true);
    setError(null);
    try {
      const token = await getToken({ template: "convex" });
      const site =
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
        process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
          ".convex.cloud",
          ".convex.site",
        );
      if (!token || !site) throw new Error();
      const response = await fetch(
        `${site}/abeka-session?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
          body: cookie,
        },
      );
      cookie = "";
      if (response.status === 503) {
        setError(t("notConfigured"));
        return;
      }
      if (!response.ok) throw new Error();
      onAccepted();
    } catch {
      setError(t("connectionError"));
    } finally {
      cookie = "";
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 ph-no-capture ph-mask"
      data-ph-no-capture
    >
      <ol className="list-decimal pl-5 text-sm space-y-2">
        <li>{t("sessionStep1")}</li>
        <li>{t("sessionStep2")}</li>
      </ol>
      <div className="space-y-2">
        <Label htmlFor="abeka-cookie">{t("sessionLabel")}</Label>
        <Input
          ref={input}
          id="abeka-cookie"
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={16384}
          required
          disabled={busy}
          data-1p-ignore
          data-lpignore="true"
        />
        <p className="text-xs text-muted-foreground">{t("sessionWarning")}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy && <Spinner aria-label={t("loading")} />}
        {t("saveSession")}
      </Button>
    </form>
  );
}

type AbekaStudent = FunctionReturnType<
  typeof api.abeka.students
>["page"][number];
type CampusChoice = Id<"campuses"> | "";
const StudentLinkContext = createContext<{
  schoolId: Id<"schools">;
  campuses:
    | FunctionReturnType<typeof api.campuses.listForInstitutionSettings>
    | undefined;
  campusDrafts: Partial<Record<Id<"abekaStudents">, CampusChoice>>;
  chooseCampus: (studentId: Id<"abekaStudents">, campus: CampusChoice) => void;
  save: (student: AbekaStudent, userId: Id<"users"> | null) => Promise<void>;
  disabled: boolean;
  savingId: Id<"abekaStudents"> | null;
} | null>(null);

function AbekaStudents({
  schoolId,
  students: results,
  loaded,
  running,
  connection,
}: {
  schoolId: Id<"schools">;
  students: AbekaStudent[];
  loaded: boolean;
  running: boolean;
  connection: Doc<"abekaConnections">;
}) {
  const t = useTranslations("settings.integrations");
  const common = useTranslations("common");
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [courseCount, setCourseCount] = useState<number | null>(null);
  const campuses = useQuery(api.campuses.listForInstitutionSettings, {
    schoolId,
  });
  const [campusDrafts, setCampusDrafts] = useState<
    Partial<Record<Id<"abekaStudents">, CampusChoice>>
  >({});
  const [savingId, setSavingId] = useState<Id<"abekaStudents"> | null>(null);
  const saving = useRef(false);
  const link = useMutation(api.abeka.linkStudent);
  async function save(student: AbekaStudent, userId: Id<"users"> | null) {
    if (running || saving.current || userId === (student.userId ?? null))
      return;
    saving.current = true;
    setSavingId(student._id);
    try {
      await link({ studentId: student._id, userId });
    } catch {
      toast.error(t("linkError"));
    } finally {
      // The reactive query owns the saved link; failed edits restore it too.
      setCampusDrafts((drafts) => {
        const next = { ...drafts };
        delete next[student._id];
        return next;
      });
      saving.current = false;
      setSavingId(null);
    }
  }
  const [report, setReport] = useState<{
    id: Id<"abekaStudents">;
    name: string;
  } | null>(null);

  const columns: ColumnDef<AbekaStudent>[] = [
    createSearchColumn<AbekaStudent>([
      "name",
      "loginId",
      "linkedName",
      "campusName",
    ]),
    {
      accessorKey: "name",
      header: createSortableHeader("Abeka"),
      cell: ({ row: { original: student } }) => (
        <div>
          <div className="font-medium">{student.name}</div>
          <div className="text-xs text-muted-foreground">
            {student.loginId}
            {!student.available && ` · ${t("inactive")}`}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "linkedName",
      header: createSortableHeader("Flexidual"),
      cell: StudentLinkCell,
    },
    {
      accessorKey: "campusName",
      header: createSortableHeader(t("campus")),
      cell: StudentCampusCell,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{t("actions")}</span>,
      cell: ({ row: { original: student } }) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!student.userId || !student.hasProgress}
            onClick={() => setReport({ id: student._id, name: student.name })}
          >
            {t("report")}
          </Button>
        </div>
      ),
    },
  ];
  return (
    <Tabs defaultValue="students" className="grid min-w-0 grid-cols-1 gap-3">
      <div className="border-b pb-3">
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="students">
            {t("students")}
            <TableResultCount count={loaded ? visibleCount : null} />
          </TabsTrigger>
          <TabsTrigger value="courses">
            {t("courses.title")}
            <TableResultCount count={courseCount} />
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="students" className="min-w-0">
        {!loaded ? (
          <AbekaLoading />
        ) : (
          <StudentLinkContext.Provider
            value={{
              schoolId,
              campuses,
              campusDrafts,
              chooseCampus: (studentId, campus) =>
                setCampusDrafts((drafts) => ({
                  ...drafts,
                  [studentId]: campus,
                })),
              save,
              disabled: running || savingId !== null,
              savingId,
            }}
          >
            <DataTable
              data={results}
              columns={columns}
              filterColumn="search"
              filterPlaceholder={t("searchStudents")}
              onFilteredRowCountChange={setVisibleCount}
              emptyMessage={
                results.length ? common("noResults") : t("noStudents")
              }
            />
          </StudentLinkContext.Provider>
        )}
      </TabsContent>
      <TabsContent value="courses" className="min-w-0">
        <AbekaCourses
          schoolId={schoolId}
          running={running}
          connection={connection}
          onCount={setCourseCount}
        />
      </TabsContent>
      <Dialog open={!!report} onOpenChange={(open) => !open && setReport(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{report?.name}</DialogTitle>
            <DialogDescription>{t("videoOnly")}</DialogDescription>
          </DialogHeader>
          {report && <StudentReport studentId={report.id} />}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

function StudentCampusCell({ row }: CellContext<AbekaStudent, unknown>) {
  const t = useTranslations("settings.integrations");
  const common = useTranslations("common");
  const { campuses, campusDrafts, chooseCampus, disabled } =
    useContext(StudentLinkContext)!;
  const student = row.original;
  return (
    <Combobox
      options={(campuses ?? [])
        .filter((c) => c.isActive)
        .map((c) => ({ value: c._id, label: c.name }))}
      value={campusDrafts[student._id] ?? student.campusId ?? ""}
      onValueChange={(value) =>
        chooseCampus(student._id, value as CampusChoice)
      }
      disabled={
        disabled || !campuses || (!student.available && !student.userId)
      }
      ariaLabel={`${t("campus")} · ${student.name}`}
      placeholder={t("chooseCampus")}
      searchPlaceholder={common("search")}
      emptyText={common("noResults")}
      deselectOnReselect={false}
      className={cn(
        "w-48",
        student.userId &&
          student.syncPending &&
          (campusDrafts[student._id] ?? student.campusId ?? "") ===
            (student.campusId ?? "") &&
          pendingSyncClassName,
      )}
    />
  );
}

function StudentLinkCell({ row }: CellContext<AbekaStudent, unknown>) {
  const t = useTranslations("settings.integrations");
  const common = useTranslations("common");
  const { schoolId, campusDrafts, disabled, savingId, save } =
    useContext(StudentLinkContext)!;
  const student = row.original;
  const campus = campusDrafts[student._id] ?? student.campusId ?? "";
  const [open, setOpen] = useState(false);
  const canQuery = open && !!campus && !disabled && student.available;
  // ponytail: only the open selector loads campus candidates, in bounded pages.
  const { results, status, loadMore } = usePaginatedQuery(
    api.abeka.studentCandidates,
    canQuery ? { schoolId, campusId: campus as Id<"campuses"> } : "skip",
    { initialNumItems: 50 },
  );
  useEffect(() => {
    if (canQuery && status === "CanLoadMore") loadMore(50);
  }, [canQuery, status, loadMore]);
  const userId =
    campus === (student.campusId ?? "") ? student.userId : undefined;
  const options =
    canQuery && status === "Exhausted"
      ? results.map((s) => ({
          value: s.id as string,
          label: `${s.name} · ${s.username ?? s.id.slice(-8)}`,
        }))
      : [];
  if (userId && !options.some((o) => o.value === userId))
    options.unshift({
      value: userId,
      label: student.linkedName ?? t("notLinked"),
    });
  if (student.userId) options.push({ value: "unlink", label: t("unlink") });
  const pending = !!userId && student.syncPending;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          <Combobox
            options={options}
            value={userId}
            onValueChange={(value) =>
              void save(
                student,
                value === "unlink" ? null : (value as Id<"users">),
              )
            }
            onOpenChange={setOpen}
            disabled={
              disabled || !campus || (!student.available && !student.userId)
            }
            ariaLabel={`${t("flexidualStudent")} · ${student.name}`}
            placeholder={t("chooseStudent")}
            searchPlaceholder={common("search")}
            emptyText={common("noResults")}
            loading={canQuery && status !== "Exhausted"}
            loadingText={t("loading")}
            deselectOnReselect={false}
            className={cn("w-64", pending && pendingSyncClassName)}
          />
          {savingId === student._id && <Spinner aria-label={t("loading")} />}
        </div>
      </TooltipTrigger>
      {pending && (
        <TooltipContent className="max-w-xs">{t("pendingSync")}</TooltipContent>
      )}
    </Tooltip>
  );
}

function StudentReport({ studentId }: { studentId: Id<"abekaStudents"> }) {
  const t = useTranslations("settings.integrations");
  const reports = useQuery(api.abeka.progress, { studentId });
  if (!reports) return <AbekaLoading />;
  return (
    <div className="max-h-[60vh] overflow-y-auto space-y-3 ph-mask">
      {!reports.length && (
        <p className="text-sm text-muted-foreground">{t("noReports")}</p>
      )}
      {reports.map((report) => (
        <AbekaCourseReport key={report._id} report={report} />
      ))}
    </div>
  );
}
