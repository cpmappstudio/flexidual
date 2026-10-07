"use client";

import {
  CourseChatComposer,
  CourseChatMessages,
} from "@/components/chat/course-chat";
import { CourseChatParticipants } from "@/components/chat/course-chat-participants";
import { CourseChatMessage } from "@/components/chat/course-chat-message";
import { CourseChatPins } from "@/components/chat/course-chat-pins";
import { CourseChatUploadProvider } from "@/components/chat/course-chat-pending";
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
import { BookOpenText, X } from "lucide-react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

interface CourseChatPageProps {
  classId: Id<"classes">;
  selectedMessageId?: string;
}

export function CourseChatPage({
  classId,
  selectedMessageId,
}: CourseChatPageProps) {
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
      <CourseChatUploadProvider key={classId}>
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
                <CourseChatPins courseId={classId} />
              </div>
            }
          />

          <ClassroomLayoutStage>
            {selectedMessageId && (
              <SelectedCourseMessage
                classId={classId}
                messageId={selectedMessageId}
              />
            )}
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
      </CourseChatUploadProvider>
    </main>
  );
}

function SelectedCourseMessage({
  classId,
  messageId,
}: {
  classId: Id<"classes">;
  messageId: string;
}) {
  const t = useTranslations("classroom.courseEvents");
  const format = useFormatter();
  const basePath = useOrgBasePath();
  const { isAuthenticated } = useConvexAuth();
  const message = useQuery(
    api.courseChatMessages.get,
    isAuthenticated ? { messageId } : "skip",
  );
  return (
    <section
      aria-label={t("selectedMessage")}
      className="relative max-h-[45%] shrink-0 overflow-y-auto border-b bg-violet-50/50 p-3 pr-12 dark:bg-violet-950/20"
    >
      <Button
        asChild
        size="icon-sm"
        variant="ghost"
        className="absolute top-2 right-2"
      >
        <Link
          href={`${basePath}/chats/${classId}`}
          aria-label={t("closeSelectedMessage")}
        >
          <X className="size-4" />
        </Link>
      </Button>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {t("selectedMessage")}
        {message?.classId === classId && (
          <time
            className="ml-2 font-normal"
            dateTime={new Date(message._creationTime).toISOString()}
          >
            {format.dateTime(message._creationTime, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        )}
      </p>
      {message === undefined ? (
        <Skeleton className="h-24 w-full max-w-sm" />
      ) : message?.classId === classId ? (
        <CourseChatMessage message={message} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("messageUnavailable")}
        </p>
      )}
    </section>
  );
}
