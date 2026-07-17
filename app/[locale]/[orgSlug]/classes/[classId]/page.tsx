"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Plus,
  Edit,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ManageScheduleDialog } from "@/components/teaching/classes/manage-schedule-dialog";
import { StudentManager } from "@/components/teaching/classes/student-manager";
import { Button } from "@/components/ui/button";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ScheduleItem } from "@/components/schedule/schedule-item";
import { ClassDialog } from "@/components/teaching/classes/class-dialog";
import { useAuth } from "@clerk/nextjs";
import { getRoleForOrg, isSuperAdmin } from "@/lib/rbac";

const ITEMS_PER_PAGE = 10;
const SCHEDULES_PER_PAGE = 10;

const classTabTriggerClassName =
  "relative mr-3 flex-none shrink-0 rounded-lg text-xs font-medium text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-[11px] after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-primary md:text-sm";

const curriculumStatusBadgeClassName = {
  scheduled:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  unscheduled:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  past: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
};

type ClassScheduleItem = {
  scheduleId: Id<"classSchedule">;
  lessonIds?: Id<"lessons">[];
  title: string;
  description?: string;
  start: number;
  end: number;
  roomName: string;
  sessionType?: "live" | "ignitia" | "abeka";
  isLive?: boolean;
  isRecurring?: boolean;
  recurrenceParentId?: Id<"classSchedule">;
};

export default function ClassDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const classId = params.classId as Id<"classes">;
  const [visibleUpcoming, setVisibleUpcoming] = useState(SCHEDULES_PER_PAGE);
  const [visiblePast, setVisiblePast] = useState(SCHEDULES_PER_PAGE);
  const [activeTab, setActiveTab] = useState("schedule");
  const orgSlug = (params.orgSlug as string) || "system";
  const { sessionClaims } = useAuth();
  const role = getRoleForOrg(sessionClaims, orgSlug);
  const isAdmin =
    isSuperAdmin(sessionClaims) || role === "admin" || role === "principal";

  const [roadmapPage, setRoadmapPage] = useState(1);
  const [focusedScheduleId, setFocusedScheduleId] =
    useState<Id<"classSchedule"> | null>(null);
  const [isScheduleActionFocused, setIsScheduleActionFocused] = useState(false);

  const classData = useQuery(api.classes.get, { id: classId });

  const lessons = useQuery(
    api.lessons.listByCurriculum,
    classData ? { curriculumId: classData.curriculumId } : "skip",
  );

  const allScheduleItems = useQuery(api.schedule.getMySchedule, {});
  const classSchedule = allScheduleItems
    ?.filter((s) => s.classId === classId)
    .sort((a, b) => a.start - b.start);

  useEffect(() => {
    if (activeTab !== "schedule" || !focusedScheduleId) {
      return;
    }

    const scrollToFocusedSchedule = () => {
      document
        .getElementById(`schedule-${focusedScheduleId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const scrollTimers = [120, 450, 900].map((delay) =>
      window.setTimeout(scrollToFocusedSchedule, delay),
    );

    const clearTimer = window.setTimeout(() => {
      setFocusedScheduleId(null);
    }, 5000);

    return () => {
      scrollTimers.forEach(window.clearTimeout);
      window.clearTimeout(clearTimer);
    };
  }, [activeTab, focusedScheduleId, visiblePast, visibleUpcoming]);

  useEffect(() => {
    if (activeTab !== "schedule" || !isScheduleActionFocused) {
      return;
    }

    const scrollToScheduleAction = () => {
      document
        .getElementById("schedule-session-action")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const scrollTimers = [120, 450, 900].map((delay) =>
      window.setTimeout(scrollToScheduleAction, delay),
    );

    const clearTimer = window.setTimeout(() => {
      setIsScheduleActionFocused(false);
    }, 5000);

    return () => {
      scrollTimers.forEach(window.clearTimeout);
      window.clearTimeout(clearTimer);
    };
  }, [activeTab, isScheduleActionFocused]);

  if (
    classData === undefined ||
    lessons === undefined ||
    allScheduleItems === undefined
  ) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!classData) return <div className="p-6">{t("class.notFound")}</div>;

  // Group schedules by lesson vs non-lesson
  const lessonSchedules =
    classSchedule?.filter((s) => s.lessonIds && s.lessonIds.length > 0) || [];

  // Get upcoming and past schedules
  const now = Date.now();
  const upcomingSchedules = classSchedule?.filter((s) => s.start >= now) || [];
  const pastSchedules =
    classSchedule?.filter((s) => s.start < now).reverse() || [];
  const visibleUpcomingSchedules = upcomingSchedules.slice(0, visibleUpcoming);
  const visiblePastSchedules = pastSchedules.slice(0, visiblePast);
  const totalRoadmapPages = Math.ceil((lessons?.length || 0) / ITEMS_PER_PAGE);
  const paginatedLessons =
    lessons?.slice(
      (roadmapPage - 1) * ITEMS_PER_PAGE,
      roadmapPage * ITEMS_PER_PAGE,
    ) || [];
  const handleOpenSessions = (schedule?: ClassScheduleItem) => {
    setActiveTab("schedule");

    if (!schedule) {
      setFocusedScheduleId(null);
      setIsScheduleActionFocused(true);
      return;
    }

    setIsScheduleActionFocused(false);
    setFocusedScheduleId(schedule.scheduleId);

    if (schedule.end < Date.now()) {
      const pastIndex = pastSchedules.findIndex(
        (item) => item.scheduleId === schedule.scheduleId,
      );
      if (pastIndex >= visiblePast) {
        setVisiblePast(pastIndex + 1);
      }
      return;
    }

    const upcomingIndex = upcomingSchedules.findIndex(
      (item) => item.scheduleId === schedule.scheduleId,
    );
    if (upcomingIndex >= visibleUpcoming) {
      setVisibleUpcoming(upcomingIndex + 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Area */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">{classData.name}</h1>
          {isAdmin && (
            <ClassDialog
              classDoc={classData}
              trigger={
                <Button variant="ghost" size="icon">
                  <Edit className="h-4 w-4 text-muted-foreground" />
                </Button>
              }
            />
          )}
        </div>
        <p className="text-muted-foreground">
          {t("curriculum.title")}:{" "}
          <span className="font-medium text-foreground">
            {classData.curriculumTitle}
          </span>
        </p>
      </div>

      <div>
        <div className="w-full min-w-0">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <div className="mb-2 overflow-x-auto">
              <TabsList className="relative z-10 mb-0 flex h-auto min-h-9 w-full justify-start rounded-none border-b border-border/70 bg-transparent p-0 pb-2.5 text-foreground">
                <TabsTrigger
                  value="schedule"
                  className={classTabTriggerClassName}
                >
                  {t("schedule.sessions")} ({classSchedule?.length || 0})
                </TabsTrigger>
                <TabsTrigger
                  value="curriculum"
                  className={classTabTriggerClassName}
                >
                  {t("navigation.curriculum")}
                </TabsTrigger>
                <TabsTrigger
                  value="students"
                  className={classTabTriggerClassName}
                >
                  {t("navigation.students")} ({classData.students.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* --- SCHEDULE TAB --- */}
            <TabsContent value="schedule" className="space-y-4 mt-0">
              {/* CALENDAR VIEW */}
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">
                    {t("schedule.sessions")}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t("schedule.sessionsDescription")}
                  </p>
                </div>

                {(upcomingSchedules.length > 0 || pastSchedules.length > 0) && (
                  <section className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="flex items-center gap-2 text-base font-semibold">
                          {t("schedule.upcoming")}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {upcomingSchedules.length}
                          </span>
                        </h3>
                      </div>
                      <div
                        id="schedule-session-action"
                        className={
                          isScheduleActionFocused
                            ? "scroll-mt-24 rounded-md ring-2 ring-primary/60 ring-offset-2 ring-offset-background transition-all duration-300"
                            : "scroll-mt-24 rounded-md transition-all duration-300"
                        }
                      >
                        <ManageScheduleDialog
                          classId={classId}
                          trigger={
                            <Button>
                              <Plus className="h-4 w-4" />
                              {t("class.scheduleSession")}
                            </Button>
                          }
                        />
                      </div>
                    </div>

                    {upcomingSchedules.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                        {t("class.noUpcomingSession")}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleUpcomingSchedules.map((schedule) => (
                          <div
                            key={schedule.scheduleId}
                            id={`schedule-${schedule.scheduleId}`}
                            className={
                              schedule.scheduleId === focusedScheduleId
                                ? "scroll-mt-24 rounded-lg ring-2 ring-primary/60 ring-offset-2 ring-offset-background transition-all duration-300"
                                : "scroll-mt-24 rounded-lg transition-all duration-300"
                            }
                          >
                            <ScheduleItem
                              schedule={schedule}
                              classId={classId}
                              variant="classSession"
                            />
                          </div>
                        ))}

                        {upcomingSchedules.length > visibleUpcoming && (
                          <div className="flex flex-col items-center gap-2 pt-4">
                            <p className="text-sm text-muted-foreground">
                              {t("schedule.showing", {
                                count: visibleUpcoming,
                                total: upcomingSchedules.length,
                              })}
                            </p>
                            <Button
                              variant="outline"
                              onClick={() =>
                                setVisibleUpcoming(
                                  (prev) => prev + SCHEDULES_PER_PAGE,
                                )
                              }
                            >
                              {t("common.loadMore")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {pastSchedules.length > 0 && (
                  <section className="space-y-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-semibold">
                        {t("schedule.past")}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {pastSchedules.length}
                        </span>
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {visiblePastSchedules.map((schedule) => (
                        <div
                          key={schedule.scheduleId}
                          id={`schedule-${schedule.scheduleId}`}
                          className={
                            schedule.scheduleId === focusedScheduleId
                              ? "scroll-mt-24 rounded-lg ring-2 ring-primary/60 ring-offset-2 ring-offset-background transition-all duration-300"
                              : "scroll-mt-24 rounded-lg transition-all duration-300"
                          }
                        >
                          <ScheduleItem
                            schedule={schedule}
                            classId={classId}
                            isPast
                            variant="classSession"
                          />
                        </div>
                      ))}

                      {pastSchedules.length > visiblePast && (
                        <div className="flex flex-col items-center gap-2 pt-4">
                          <p className="text-sm text-muted-foreground">
                            {t("schedule.showing", {
                              count: visiblePast,
                              total: pastSchedules.length,
                            })}
                          </p>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setVisiblePast(
                                (prev) => prev + SCHEDULES_PER_PAGE,
                              )
                            }
                          >
                            {t("common.loadMore")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {upcomingSchedules.length === 0 &&
                  pastSchedules.length === 0 && (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <CalendarIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          {t("schedule.noSchedules")}
                        </h3>
                        <p className="text-muted-foreground mb-4 max-w-sm">
                          {t("schedule.createPrompt")}
                        </p>
                        <ManageScheduleDialog classId={classId} />
                      </CardContent>
                    </Card>
                  )}
              </div>
            </TabsContent>

            {/* --- CURRICULUM TAB --- */}
            <TabsContent value="curriculum" className="mt-0">
              <CurriculumOverview
                lessons={paginatedLessons}
                totalLessons={lessons.length}
                lessonSchedules={lessonSchedules as ClassScheduleItem[]}
                curriculumId={classData.curriculumId}
                orgSlug={orgSlug}
                isAdmin={isAdmin}
                currentPage={roadmapPage}
                totalPages={totalRoadmapPages}
                onPageChange={setRoadmapPage}
                onOpenSessions={handleOpenSessions}
              />
            </TabsContent>

            {/* --- STUDENTS TAB --- */}
            <TabsContent value="students" className="mt-0">
              <StudentManager
                classId={classId}
                curriculumId={classData.curriculumId}
              />
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </div>
  );
}

function CurriculumOverview({
  lessons,
  totalLessons,
  lessonSchedules,
  curriculumId,
  orgSlug,
  isAdmin,
  currentPage,
  totalPages,
  onPageChange,
  onOpenSessions,
}: {
  lessons: Doc<"lessons">[];
  totalLessons: number;
  lessonSchedules: ClassScheduleItem[];
  curriculumId: Id<"curriculums">;
  orgSlug: string;
  isAdmin: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
  onOpenSessions: (schedule?: ClassScheduleItem) => void;
}) {
  const t = useTranslations();

  return (
    <div>
      <div>
        <div className="flex flex-col sm:flex-row justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {t("navigation.curriculum")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("class.curriculumReadOnlyDescription")}
            </p>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="justify-start bg-background"
              asChild
            >
              <Link
                href={`/${orgSlug}/curriculums?curriculumId=${curriculumId}`}
              >
                {t("class.manageCurriculumInSection")}
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-4 pt-2">
        {totalLessons === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("lesson.noLessonsForCurriculum")}
          </div>
        ) : (
          <div className="space-y-3">
            {lessons.map((lesson) => {
              const scheduledItem = lessonSchedules.find((s) =>
                s.lessonIds?.includes(lesson._id),
              );
              const isPast = scheduledItem
                ? scheduledItem.end < Date.now()
                : false;
              const sessionFormatLabel =
                scheduledItem?.sessionType === "ignitia"
                  ? "Ignitia"
                  : scheduledItem?.sessionType === "abeka"
                    ? "Abeka"
                    : null;
              const scheduledMetaLabel = scheduledItem
                ? sessionFormatLabel
                  ? t("class.curriculumScheduledMetaWithPlatform", {
                      date: format(scheduledItem.start, "MMM d, h:mm a"),
                      platform: sessionFormatLabel,
                    })
                  : t("class.curriculumScheduledMeta", {
                      date: format(scheduledItem.start, "MMM d, h:mm a"),
                    })
                : null;

              return (
                <div
                  key={lesson._id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {lesson.order}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{lesson.title}</p>
                        {scheduledItem && (
                          <Badge
                            variant="outline"
                            className={
                              isPast
                                ? curriculumStatusBadgeClassName.past
                                : curriculumStatusBadgeClassName.scheduled
                            }
                          >
                            {isPast
                              ? t("schedule.pastSession")
                              : t("lesson.scheduled")}
                          </Badge>
                        )}
                        {!scheduledItem && (
                          <Badge
                            variant="outline"
                            className={
                              curriculumStatusBadgeClassName.unscheduled
                            }
                          >
                            {t("class.notScheduled")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {lesson.description || t("common.noDescription")}
                      </p>
                      {scheduledMetaLabel && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {scheduledMetaLabel}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 sm:ml-4">
                    <Button
                      size="sm"
                      variant={scheduledItem ? "link" : "default"}
                      className={
                        scheduledItem
                          ? "h-auto px-0 text-muted-foreground hover:text-primary"
                          : undefined
                      }
                      onClick={() => onOpenSessions(scheduledItem)}
                    >
                      {!scheduledItem}
                      {scheduledItem
                        ? t("class.viewInSessions")
                        : t("class.scheduleInSessions")}
                      {scheduledItem && <ArrowRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4 border-t border-border/50">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
