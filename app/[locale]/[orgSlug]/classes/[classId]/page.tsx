"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import Image from "next/image";
import {
  ArchiveRestore,
  BookOpen,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Users,
} from "lucide-react";

import { StudentManager } from "@/components/teaching/classes/student-manager";
import { Button } from "@/components/ui/button";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { CurriculumIcon } from "@/components/teaching/curriculums/curriculum-icon";
import { ClassOverviewSidebar } from "@/components/teaching/classes/class-overview-sidebar";
import {
  NextClassPanel,
  NextClassPreview,
} from "@/components/schedule/next-class-panel";
import { RocketLaunchButtonContent } from "@/components/student/rocket-transition";
import { PastClassesPanel } from "@/components/teaching/classes/past-classes-panel";
import { toast } from "sonner";
import type { CurriculumLessonProgress } from "@/lib/course-progress";

const ITEMS_PER_PAGE = 10;

const classTabTriggerClassName =
  "relative mr-3 flex-none shrink-0 gap-1.5 rounded-lg text-sm font-medium text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-[11px] after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-secondary md:text-base";

const curriculumStatusBadgeClassName = {
  taught: "border-success/30 bg-success/10 text-success",
  pending: "border-border bg-muted text-muted-foreground",
};

export default function ClassDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as Id<"classes">;
  const [activeTab, setActiveTab] = useState("schedule");
  const [isLaunchingClassroom, setIsLaunchingClassroom] = useState(false);
  const [isRestoringChat, setIsRestoringChat] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const orgSlug = (params.orgSlug as string) || "system";
  const { access } = useStaffAccess();
  const queryNow = useCurrentMinute();
  const canManageClass = access?.canManageCampus ?? false;
  const canViewStudentProfiles = canManageClass || access?.role === "teacher";
  const canViewCurriculumSettings = access?.canViewInstitutionSettings ?? false;

  const [roadmapPage, setRoadmapPage] = useState(1);

  const classData = useQuery(api.classes.get, { id: classId });
  const setArchived = useMutation(api.courseChatMessages.setArchived);

  const curriculumProgress = useQuery(api.lessons.getClassCurriculumProgress, {
    classId,
  });

  const scheduleResult = useQuery(api.schedule.getMySchedule, {
    classId,
    now: queryNow,
    includeAttendance: false,
    includeRecordings: false,
  });
  const pastClassesResult = useQuery(api.recordings.listRecentPastClasses, {
    classId,
    now: queryNow,
  });
  const allScheduleItems = useRetainedQueryResult(scheduleResult, classId);
  const pastClasses = useRetainedQueryResult(pastClassesResult, classId);
  const classSchedule = useMemo(
    () =>
      (allScheduleItems ?? [])
        .filter((schedule) => schedule.classId === classId)
        .sort((a, b) => a.start - b.start),
    [allScheduleItems, classId],
  );
  const lessons = curriculumProgress?.lessons ?? [];

  if (
    classData === undefined ||
    curriculumProgress === undefined ||
    allScheduleItems === undefined
  ) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-16 shrink-0 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!classData) return <div className="p-6">{t("class.notFound")}</div>;

  const availableSchedules =
    classSchedule?.filter(
      (schedule) => schedule.end > queryNow && schedule.status !== "cancelled",
    ) ?? [];
  const nextSchedule =
    availableSchedules.find(
      (schedule) =>
        schedule.status === "active" ||
        schedule.isLive ||
        (queryNow >= schedule.start && queryNow <= schedule.end),
    ) ??
    availableSchedules[0] ??
    null;
  const laterSchedules = nextSchedule
    ? availableSchedules
        .filter((schedule) => schedule.scheduleId !== nextSchedule.scheduleId)
        .slice(0, 3)
    : [];
  const totalRoadmapPages = Math.ceil((lessons?.length || 0) / ITEMS_PER_PAGE);
  const paginatedLessons =
    lessons?.slice(
      (roadmapPage - 1) * ITEMS_PER_PAGE,
      roadmapPage * ITEMS_PER_PAGE,
    ) || [];
  const handleViewAllLessons = () => {
    setActiveTab("curriculum");
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleClassroomLaunchComplete = () => {
    if (!nextSchedule) return;
    router.push(`/${orgSlug}/classroom/${nextSchedule.roomName}`);
  };
  const handleRestoreChat = async () => {
    if (isRestoringChat) return;
    setIsRestoringChat(true);
    try {
      await setArchived({ classId, archived: false });
      toast.success(t("navigation.chatRestored"));
    } catch {
      toast.error(t("navigation.restoreChatError"));
    } finally {
      setIsRestoringChat(false);
    }
  };

  return (
    <div className="grid gap-5 xl:min-h-[calc(100svh-var(--header-height)-2rem)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        {/* Header Area */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CurriculumIcon
              iconKey={classData.curriculumIconKey}
              size={64}
              className="size-16"
            />
            <div className="min-w-0 space-y-1">
              <h1 className="text-3xl font-bold">{classData.name}</h1>
              <p className="text-muted-foreground">
                {t("navigation.curriculum")}:{" "}
                <span className="font-medium text-foreground">
                  {classData.curriculumTitle}
                </span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {classData.chatArchivedAt !== undefined ? (
              canManageClass ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("classroom.archivedChat")}
                      title={t("classroom.archivedChat")}
                      className="size-10 border-0 p-0 opacity-50 shadow-none hover:bg-transparent"
                    >
                      <Image
                        src="/chat-icon.svg"
                        alt=""
                        width={36}
                        height={36}
                        aria-hidden="true"
                        className="size-9 object-contain grayscale"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={isRestoringChat}
                      onSelect={() => void handleRestoreChat()}
                    >
                      {isRestoringChat ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <ArchiveRestore />
                      )}
                      {t("navigation.unarchiveChat")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled
                  aria-label={t("classroom.archivedChat")}
                  title={t("classroom.archivedChat")}
                  className="size-10 border-0 p-0 opacity-50 shadow-none"
                >
                  <Image
                    src="/chat-icon.svg"
                    alt=""
                    width={36}
                    height={36}
                    aria-hidden="true"
                    className="size-9 object-contain grayscale"
                  />
                </Button>
              )
            ) : (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-10 border-0 p-0 shadow-none hover:bg-transparent"
              >
                <Link
                  href={`/${orgSlug}/chats/${classData._id}`}
                  aria-label={t("classroom.courseChat")}
                  title={t("classroom.courseChat")}
                >
                  <Image
                    src="/chat-icon.svg"
                    alt=""
                    width={36}
                    height={36}
                    aria-hidden="true"
                    className="size-9 object-contain"
                  />
                </Link>
              </Button>
            )}
            {canManageClass && (
              <Button asChild>
                <Link
                  href={`/${orgSlug}/classes/new?edit=${classData._id}`}
                  aria-label={t("class.edit")}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t("class.edit")}</span>
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div ref={tabsRef} className="w-full min-w-0">
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
                  <CalendarIcon className="size-4" aria-hidden="true" />
                  {t("schedule.sessions")} ({classSchedule?.length || 0})
                </TabsTrigger>
                <TabsTrigger
                  value="curriculum"
                  className={classTabTriggerClassName}
                >
                  <BookOpen className="size-4" aria-hidden="true" />
                  {t("navigation.curriculum")}
                </TabsTrigger>
                <TabsTrigger
                  value="students"
                  className={classTabTriggerClassName}
                >
                  <Users className="size-4" aria-hidden="true" />
                  {t("navigation.students")} ({classData.students.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* --- SCHEDULE TAB --- */}
            <TabsContent value="schedule" className="mt-0 space-y-5">
              <NextClassPanel
                nextClass={
                  nextSchedule
                    ? {
                        id: nextSchedule.scheduleId,
                        title:
                          nextSchedule.className ||
                          nextSchedule.title ||
                          classData.name,
                        start: nextSchedule.start,
                        end: nextSchedule.end,
                        status: nextSchedule.status,
                        isLive: nextSchedule.isLive,
                        sessionType: nextSchedule.sessionType ?? "live",
                      }
                    : null
                }
                action={
                  nextSchedule ? (
                    <Button
                      type="button"
                      onClick={() => {
                        if (!isLaunchingClassroom) {
                          setIsLaunchingClassroom(true);
                        }
                      }}
                      aria-busy={isLaunchingClassroom}
                      className="group relative mt-4 h-10 overflow-hidden rounded-full bg-info px-6 text-sm font-bold text-info-foreground shadow-lg hover:bg-info/90 xl:mt-5 xl:h-11 xl:px-8 xl:text-base"
                    >
                      <RocketLaunchButtonContent
                        label={t("dashboard.goToClassroom")}
                        isLaunching={isLaunchingClassroom}
                        onComplete={handleClassroomLaunchComplete}
                      />
                    </Button>
                  ) : undefined
                }
                layout={laterSchedules.length > 0 ? "split" : "stacked"}
              >
                <NextClassPreview
                  label={t("schedule.upcoming")}
                  className="md:mt-0 md:h-full md:max-w-none xl:mt-0"
                  items={laterSchedules.map((schedule) => ({
                    id: schedule.scheduleId,
                    title: schedule.title || classData.name,
                    meta: new Intl.DateTimeFormat(locale, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: schedule.timeZone,
                    }).format(schedule.start),
                    sessionType: schedule.sessionType ?? "live",
                  }))}
                />
              </NextClassPanel>
              <PastClassesPanel sessions={pastClasses} />
            </TabsContent>

            {/* --- CURRICULUM TAB --- */}
            <TabsContent value="curriculum" className="mt-0">
              <CurriculumOverview
                lessons={paginatedLessons}
                totalLessons={lessons.length}
                curriculumId={classData.curriculumId}
                orgSlug={orgSlug}
                canViewCurriculumSettings={canViewCurriculumSettings}
                currentPage={roadmapPage}
                totalPages={totalRoadmapPages}
                onPageChange={setRoadmapPage}
              />
            </TabsContent>

            {/* --- STUDENTS TAB --- */}
            <TabsContent value="students" className="mt-0">
              <StudentManager
                classId={classId}
                curriculumId={classData.curriculumId}
                canManage={canManageClass}
                canViewProfiles={canViewStudentProfiles}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ClassOverviewSidebar
        lessons={lessons}
        progress={
          curriculumProgress ?? {
            totalLessons: 0,
            taughtLessons: 0,
            pendingLessons: 0,
            percentage: 0,
          }
        }
        onViewAllLessons={handleViewAllLessons}
      />
    </div>
  );
}

function CurriculumOverview({
  lessons,
  totalLessons,
  curriculumId,
  orgSlug,
  canViewCurriculumSettings,
  currentPage,
  totalPages,
  onPageChange,
}: {
  lessons: CurriculumLessonProgress[];
  totalLessons: number;
  curriculumId: Id<"curriculums">;
  orgSlug: string;
  canViewCurriculumSettings: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
}) {
  const t = useTranslations();
  const format = useFormatter();

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
          {canViewCurriculumSettings && (
            <Button
              variant="outline"
              size="sm"
              className="justify-start bg-background"
              asChild
            >
              <Link
                href={`/${orgSlug}/settings/curriculums?curriculumId=${curriculumId}`}
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
          <ItemGroup className="gap-3">
            {lessons.map((lesson) => {
              return (
                <Item key={lesson._id} variant="outline" className="bg-sidebar">
                  <ItemMedia
                    variant="icon"
                    className="rounded-full border-0 bg-primary/10 font-bold text-primary"
                  >
                    {lesson.order}
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="flex-wrap text-base">
                      <span>{lesson.title}</span>
                      <Badge
                        variant="outline"
                        className={
                          curriculumStatusBadgeClassName[lesson.status]
                        }
                      >
                        {t(
                          lesson.status === "taught"
                            ? "class.lessonTaught"
                            : "class.lessonPending",
                        )}
                      </Badge>
                    </ItemTitle>
                    <ItemDescription>
                      {lesson.description || t("common.noDescription")}
                    </ItemDescription>
                    {lesson.lastTaughtAt !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        {t("class.lessonTaughtDetails", {
                          count: lesson.sessionCount,
                          date: format.dateTime(lesson.lastTaughtAt, {
                            dateStyle: "medium",
                          }),
                        })}
                      </p>
                    )}
                  </ItemContent>
                </Item>
              );
            })}
          </ItemGroup>
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
