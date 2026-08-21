"use client";

import {
  CourseChatComposer,
  CourseChatMessages,
} from "@/components/chat/course-chat";
import { CourseChatParticipants } from "@/components/chat/course-chat-participants";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import {
  ClassroomLayout,
  ClassroomLayoutControls,
  ClassroomLayoutStage,
} from "@/components/classroom/classroom-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { Link } from "@/i18n/navigation";
import { findLiveStandardClassroom } from "@/lib/course-classroom";
import { useConvexAuth, useQuery } from "convex/react";
import { BookOpenText } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

interface CourseChatPageProps {
  classId: Id<"classes">;
}

export function CourseChatPage({ classId }: CourseChatPageProps) {
  const t = useTranslations("classroom");
  const dashboardT = useTranslations("dashboard");
  const basePath = useOrgBasePath();
  const { isAuthenticated } = useConvexAuth();
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(true);
  const now = useCurrentMinute();
  const context = useQuery(
    api.classes.getChatContext,
    isAuthenticated ? { classId } : "skip",
  );
  const scheduleResult = useQuery(
    api.schedule.getMySchedule,
    isAuthenticated
      ? {
          classId,
          now,
          includeAttendance: false,
          includeRecordings: false,
        }
      : "skip",
  );
  const schedules = useRetainedQueryResult(scheduleResult, classId);
  const liveStandardClass = useMemo(
    () => findLiveStandardClassroom(schedules ?? []),
    [schedules],
  );

  if (context === undefined) {
    return (
      <main data-classroom-layout className="h-full min-h-0 w-full">
        <Skeleton className="size-full rounded-none" />
      </main>
    );
  }

  if (!context) {
    return (
      <main
        data-classroom-layout
        className="flex h-full min-h-0 w-full items-center justify-center text-sm text-muted-foreground"
      >
        {t("courseChatNotFound")}
      </main>
    );
  }

  return (
    <main
      data-classroom-layout
      className="h-full min-h-0 w-full overflow-hidden"
    >
      <ClassroomLayout isSidebarOpen={isParticipantsOpen}>
        <ClassroomHeader
          title={context.course.name}
          subtitle={context.course.curriculumTitle}
          curriculumIconKey={context.course.curriculumIconKey}
          isActive={false}
          activeLabel={t("courseChat")}
          waitingLabel={t("courseChat")}
          isRecording={false}
          isPhoneLandscape={false}
          isPanelOpen={isParticipantsOpen}
          openPanelLabel={t("openParticipantsPanel")}
          closePanelLabel={t("closeParticipantsPanel")}
          onPanelOpenChange={setIsParticipantsOpen}
          action={
            <div className="flex items-center gap-1.5">
              {liveStandardClass ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="size-10 border-0 p-0 shadow-none hover:bg-transparent"
                    >
                      <Link
                        href={`${basePath}/classroom/${liveStandardClass.roomName}`}
                        aria-label={dashboardT("goToClassroom")}
                      >
                        <Image
                          src="/rocket.svg"
                          alt=""
                          width={22}
                          height={21}
                          aria-hidden="true"
                          className="h-[1.375rem] w-auto"
                        />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {dashboardT("goToClassroom")}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex"
                      tabIndex={0}
                      aria-label={t("classroomUnavailable")}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled
                        tabIndex={-1}
                        aria-hidden="true"
                        className="size-10 border-0 p-0 shadow-none"
                      >
                        <Image
                          src="/rocket.svg"
                          alt=""
                          width={22}
                          height={21}
                          aria-hidden="true"
                          className="h-[1.375rem] w-auto grayscale"
                        />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t("classroomUnavailable")}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="size-10 border-0 p-0 text-primary shadow-none hover:bg-transparent hover:text-primary"
                  >
                    <Link
                      href={`${basePath}/classes/${classId}`}
                      aria-label={t("viewCourseDetails")}
                    >
                      <BookOpenText className="size-6" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("viewCourseDetails")}
                </TooltipContent>
              </Tooltip>
            </div>
          }
        />

        <ClassroomLayoutStage>
          <CourseChatMessages courseId={classId} />
        </ClassroomLayoutStage>

        <ClassroomLayoutControls>
          <CourseChatComposer courseId={classId} />
        </ClassroomLayoutControls>

        <CourseChatParticipants
          classId={classId}
          participants={context.participants}
          isOpen={isParticipantsOpen}
          canModerate={context.canModerate}
          canDisableChat={context.canDisableChat}
          chatSettings={context.chatSettings}
        />
      </ClassroomLayout>
    </main>
  );
}
