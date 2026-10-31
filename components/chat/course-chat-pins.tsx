"use client";

import { useEffect, useState } from "react";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useTranslations } from "next-intl";
import { LoaderCircle, Pin } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResponsiveFeedPanel } from "@/components/ui/responsive-feed-panel";
import { CourseChatMessage } from "./course-chat-message";
import { UnreadIndicator } from "@/components/notifications/unread-indicator";
import { useDocumentActive } from "@/hooks/use-document-active";

type ChatPinsTarget =
  | { courseId: Id<"classes">; eventId?: never }
  | { eventId: Id<"events">; courseId?: never };

export function CourseChatPins({ courseId, eventId }: ChatPinsTarget) {
  const t = useTranslations("classroom");
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  const courseUnread = useQuery(
    api.courseChatMessages.hasUnreadPins,
    isAuthenticated && courseId ? { classId: courseId } : "skip",
  );
  const eventUnread = useQuery(
    api.eventChatMessages.hasUnreadPins,
    isAuthenticated && eventId ? { eventId } : "skip",
  );
  const unread = eventId ? eventUnread : courseUnread;
  return (
    <ResponsiveFeedPanel
      open={open}
      onOpenChange={setOpen}
      title={t("pinnedMessages")}
      description={t("pinnedMessagesDescription")}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 border-0 p-0 text-primary shadow-none hover:bg-transparent hover:text-primary"
          aria-label={t("pinnedMessages")}
          title={t("pinnedMessages")}
        >
          <span className="relative inline-flex size-6">
            <Pin className="size-6" />
            <UnreadIndicator
              dot
              count={unread === true ? 1 : 0}
              label={t("unreadPinnedMessages")}
              className="top-0 right-0"
            />
          </span>
        </Button>
      }
    >
      {eventId ? (
        <PinnedMessageFeed eventId={eventId} />
      ) : (
        <PinnedMessageFeed courseId={courseId!} />
      )}
    </ResponsiveFeedPanel>
  );
}

function PinnedMessageFeed({ courseId, eventId }: ChatPinsTarget) {
  const t = useTranslations("classroom");
  const common = useTranslations("systemNotifications");
  const { isAuthenticated } = useConvexAuth();
  const courseArgs =
    isAuthenticated && courseId ? { classId: courseId } : "skip";
  const eventArgs = isAuthenticated && eventId ? { eventId } : "skip";
  const coursePage = usePaginatedQuery(
    api.courseChatMessages.listPinned,
    courseArgs,
    { initialNumItems: 20 },
  );
  const eventPage = usePaginatedQuery(
    api.eventChatMessages.listPinned,
    eventArgs,
    { initialNumItems: 20 },
  );
  const { results, status, loadMore } = eventId ? eventPage : coursePage;
  const courseStatus = useQuery(api.courseChatMessages.getMyStatus, courseArgs);
  const eventStatus = useQuery(api.eventChatMessages.getMyStatus, eventArgs);
  const chatStatus = eventId ? eventStatus : courseStatus;
  const markCourseSeen = useMutation(api.courseChatMessages.markPinsSeen);
  const markEventSeen = useMutation(api.eventChatMessages.markPinsSeen);
  const active = useDocumentActive();
  const latestId = results[0]?._id;
  const latestPinnedAt = results[0]?.pinnedAt;
  useEffect(() => {
    if (active && latestId && latestPinnedAt !== undefined) {
      const receipt = eventId
        ? markEventSeen({
            messageId: latestId as Id<"eventChatMessages">,
            pinnedAt: latestPinnedAt,
          })
        : markCourseSeen({
            messageId: latestId as Id<"courseChatMessages">,
            pinnedAt: latestPinnedAt,
          });
      void receipt.catch((error) =>
        console.error("Pinned messages read receipt failed", error),
      );
    }
  }, [
    active,
    latestId,
    latestPinnedAt,
    eventId,
    markCourseSeen,
    markEventSeen,
  ]);
  const [timeZone, setTimeZone] = useState<string>();
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  useEffect(() => {
    if (results.length === 0 && status === "CanLoadMore") loadMore(20);
  }, [results.length, status, loadMore]);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <h2 className="font-semibold text-foreground">{t("pinnedMessages")}</h2>
      </div>
      <ScrollArea type="always" className="h-0 min-h-0 flex-1">
        {status === "LoadingFirstPage" ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {common("loading")}
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Pin className="size-6" />
            </span>
            <p className="font-medium text-foreground">
              {t("noPinnedMessages")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {results.map((message) => (
              <CourseChatMessage
                key={message._id}
                message={message}
                timeZone={timeZone}
                canPin={chatStatus?.canPin === true}
              />
            ))}
          </div>
        )}
        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <div className="flex justify-center p-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(20)}
            >
              {status === "LoadingMore" && (
                <LoaderCircle className="animate-spin" />
              )}
              {common("loadMore")}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
