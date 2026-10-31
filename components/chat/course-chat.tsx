"use client";

import {
  CourseChatMessage,
  type ChatMessage,
  type EventChatMessage,
} from "./course-chat-message";
import { CourseChatReferenceInput } from "./course-chat-reference-input";
import { useDocumentActive } from "@/hooks/use-document-active";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import {
  CourseChatUploadProvider,
  PendingChatMessage,
  usePendingChatUpload,
} from "./course-chat-pending";
import {
  ChatFilePreview,
  useChatFileRequest,
  optimizeChatImage,
} from "./course-chat-attachments";
import {
  CHAT_FILE_TYPES,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_MESSAGE_BYTES,
  containsChatLink,
  isValidChatFile,
} from "@/lib/chat-attachments";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { parseConvexError } from "@/lib/error-utils";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { cn } from "@/lib/utils";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  ArrowDown,
  LoaderCircle,
  SendHorizontal,
  Paperclip,
  Plus,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  type FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { toast } from "sonner";

interface CourseChatProps {
  courseId?: Id<"classes">;
  broadcastId?: Id<"broadcasts">;
  scheduleId?: Id<"classSchedule">;
  className?: string;
}

type ChatTarget =
  | {
      courseId: Id<"classes">;
      scheduleId?: Id<"classSchedule">;
      eventId?: never;
      broadcastId?: never;
    }
  | {
      eventId: Id<"events">;
      courseId?: never;
      scheduleId?: never;
      broadcastId?: never;
    }
  | {
      broadcastId: Id<"broadcasts">;
      courseId?: never;
      scheduleId?: never;
      eventId?: never;
    };

const MAX_MESSAGE_GROUP_SIZE = 6;

export function CourseChat({
  courseId,
  broadcastId,
  scheduleId,
  className,
}: CourseChatProps) {
  return (
    <CourseChatUploadProvider
      key={`${broadcastId ?? courseId}:${scheduleId ?? "course"}`}
    >
      <div
        data-course-chat-id={courseId}
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden bg-card",
          className,
        )}
      >
        <CourseChatMessages
          courseId={courseId}
          broadcastId={broadcastId}
          scheduleId={scheduleId}
        />
        <CourseChatComposer
          courseId={courseId}
          broadcastId={broadcastId}
          scheduleId={scheduleId}
          className="border-t border-primary/20"
        />
      </div>
    </CourseChatUploadProvider>
  );
}

export function EventChat({
  eventId,
  className,
}: {
  eventId: Id<"events">;
  className?: string;
}) {
  return (
    <CourseChatUploadProvider key={eventId}>
      <div
        data-event-chat-id={eventId}
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden bg-card",
          className,
        )}
      >
        <EventChatMessages eventId={eventId} />
        <EventChatComposer
          eventId={eventId}
          className="border-t border-primary/20"
        />
      </div>
    </CourseChatUploadProvider>
  );
}

export function CourseChatMessages({
  courseId,
  broadcastId,
  scheduleId,
  className,
}: CourseChatProps) {
  if (broadcastId)
    return <ChatMessages broadcastId={broadcastId} className={className} />;
  if (courseId)
    return (
      <ChatMessages
        courseId={courseId}
        scheduleId={scheduleId}
        className={className}
      />
    );
  return null;
}

export function EventChatMessages({
  eventId,
  className,
}: {
  eventId: Id<"events">;
  className?: string;
}) {
  return <ChatMessages eventId={eventId} className={className} />;
}

function ChatMessages({
  courseId,
  broadcastId,
  scheduleId,
  eventId,
  className,
}: ChatTarget & { className?: string }) {
  const t = useTranslations("classroom");
  const eventT = useTranslations("events");
  const format = useFormatter();
  const timeZone = useBrowserTimeZone();
  const { isAuthenticated } = useConvexAuth();
  const courseArgs =
    isAuthenticated && (courseId || broadcastId)
      ? {
          ...(broadcastId ? { broadcastId } : { classId: courseId! }),
          ...(scheduleId ? { scheduleId } : {}),
        }
      : "skip";
  const courseStatus = useQuery(api.courseChatMessages.getMyStatus, courseArgs);
  const eventStatus = useQuery(
    api.eventChatMessages.getMyStatus,
    isAuthenticated && eventId ? { eventId } : "skip",
  );
  const coursePage = usePaginatedQuery(
    api.courseChatMessages.list,
    courseArgs,
    { initialNumItems: 40 },
  );
  const eventPage = usePaginatedQuery(
    api.eventChatMessages.list,
    isAuthenticated && eventId ? { eventId } : "skip",
    { initialNumItems: 40 },
  );
  const chatStatus = eventId ? eventStatus : courseStatus;
  const { results, status, loadMore } = eventId ? eventPage : coursePage;
  const messages = useMemo(() => {
    const chronological = [...results].reverse();
    let previousDay: string | undefined;
    let groupSize = 0;
    const grouped = [];
    for (const [index, message] of chronological.entries()) {
      const previous = chronological[index - 1];
      const day = timeZone
        ? format.dateTime(message._creationTime, {
            timeZone,
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : undefined;
      const startsDay = day !== undefined && day !== previousDay;
      const startsGroup =
        index === 0 ||
        startsDay ||
        ("event" in message && Boolean(message.event)) ||
        (previous && "event" in previous && Boolean(previous.event)) ||
        message.authorId !== previous?.authorId ||
        groupSize === MAX_MESSAGE_GROUP_SIZE;
      groupSize = startsGroup ? 1 : groupSize + 1;
      previousDay = day;
      grouped.push({ message, day, startsDay, startsGroup });
    }
    return grouped;
  }, [results, timeZone, format]);

  return (
    <div
      data-course-chat-id={courseId}
      data-event-chat-id={eventId}
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <ChatReadReceipt
          messageId={
            eventId
              ? (results[0]?._id as Id<"eventChatMessages"> | undefined)
              : (results[0]?._id as Id<"courseChatMessages"> | undefined)
          }
          kind={eventId ? "event" : "course"}
          enabled={chatStatus !== undefined && chatStatus.readOnly !== true}
        />
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-1 px-3 py-4">
              <MessageScrollerItem messageId="chat-visibility-note">
                <Marker variant="separator">
                  <MarkerContent className="text-xs leading-relaxed sm:text-sm">
                    {eventId
                      ? eventT("chatDescription")
                      : t(
                          broadcastId
                            ? "broadcasts.description"
                            : "classChatDescription",
                        )}
                  </MarkerContent>
                </Marker>
              </MessageScrollerItem>
              {status === "CanLoadMore" || status === "LoadingMore" ? (
                <MessageScrollerItem messageId="load-earlier-messages">
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={status === "LoadingMore"}
                      onClick={() => loadMore(40)}
                      className="text-muted-foreground"
                    >
                      {status === "LoadingMore" && (
                        <LoaderCircle className="animate-spin" />
                      )}
                      {t("loadEarlierMessages")}
                    </Button>
                  </div>
                </MessageScrollerItem>
              ) : null}
              {status === "LoadingFirstPage" ? (
                <MessageScrollerItem messageId="loading-messages">
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    {t("loadingMessages")}
                  </div>
                </MessageScrollerItem>
              ) : messages.length === 0 ? (
                <MessageScrollerItem messageId="empty-chat">
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("emptyChat")}
                  </p>
                </MessageScrollerItem>
              ) : null}
              {messages.map(({ message, day, startsDay, startsGroup }) => {
                return (
                  <Fragment key={message._id}>
                    {startsDay && (
                      <MessageScrollerItem messageId={`day:${day}`}>
                        <Marker
                          variant="separator"
                          role="separator"
                          aria-label={day}
                          className="py-3"
                        >
                          <MarkerContent className="text-xs font-medium sm:text-sm">
                            {day}
                          </MarkerContent>
                        </Marker>
                      </MessageScrollerItem>
                    )}
                    <MessageScrollerItem
                      messageId={message._id}
                      className={startsGroup && !startsDay ? "pt-3" : undefined}
                    >
                      <CourseChatMessage
                        message={message as ChatMessage | EventChatMessage}
                        startsGroup={startsGroup}
                        timeZone={timeZone}
                        canPin={chatStatus?.canPin === true}
                      />
                    </MessageScrollerItem>
                  </Fragment>
                );
              })}
              <PendingChatMessage
                confirmedAttachmentIds={results.flatMap(
                  (message) =>
                    message.attachments?.map((file) => file.id) ?? [],
                )}
              />
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton>
            <ArrowDown />
            <span className="sr-only">{t("scrollToLatestMessages")}</span>
          </MessageScrollerButton>
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  );
}

function ChatReadReceipt({
  messageId,
  enabled,
  kind,
}: {
  messageId?: Id<"courseChatMessages"> | Id<"eventChatMessages">;
  enabled: boolean;
  kind: "course" | "event";
}) {
  const { visibleMessageIds } = useMessageScrollerVisibility();
  const markCourseRead = useMutation(api.courseChatNotifications.markRead);
  const markEventRead = useMutation(api.eventChatNotifications.markRead);
  const isFocused = useDocumentActive();
  const isVisible = Boolean(messageId && visibleMessageIds.includes(messageId));
  useEffect(() => {
    if (enabled && messageId && isVisible && isFocused) {
      const receipt =
        kind === "event"
          ? markEventRead({ messageId: messageId as Id<"eventChatMessages"> })
          : markCourseRead({
              messageId: messageId as Id<"courseChatMessages">,
            });
      void receipt.catch((error) =>
        console.error("Chat read receipt failed", error),
      );
    }
  }, [
    enabled,
    messageId,
    isVisible,
    isFocused,
    kind,
    markCourseRead,
    markEventRead,
  ]);
  return null;
}

export function CourseChatComposer({
  courseId,
  broadcastId,
  scheduleId,
  className,
}: CourseChatProps) {
  if (!courseId && !broadcastId) return null;
  return (
    <ChatComposer
      key={`${broadcastId ?? courseId}:${scheduleId ?? "course"}`}
      {...(broadcastId ? { broadcastId } : { courseId: courseId!, scheduleId })}
      className={className}
    />
  );
}

export function EventChatComposer({
  eventId,
  className,
}: {
  eventId: Id<"events">;
  className?: string;
}) {
  return <ChatComposer key={eventId} eventId={eventId} className={className} />;
}

function ChatComposer({
  courseId,
  broadcastId,
  scheduleId,
  eventId,
  className,
}: ChatTarget & { className?: string }) {
  const t = useTranslations("classroom");
  const { isAuthenticated } = useConvexAuth();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [files, setFiles] = useState<
    {
      file: File;
      id?: Id<"courseChatAttachments"> | Id<"eventChatAttachments">;
    }[]
  >([]);
  const { setPending } = usePendingChatUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestFile = useChatFileRequest(eventId ? "event" : "course");
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      setPending(null);
    },
    [setPending],
  );
  const sendCourseMessage = useMutation(api.courseChatMessages.send);
  const sendEventMessage = useMutation(api.eventChatMessages.send);
  const courseStatus = useQuery(
    api.courseChatMessages.getMyStatus,
    isAuthenticated && (courseId || broadcastId)
      ? {
          ...(broadcastId ? { broadcastId } : { classId: courseId! }),
          ...(scheduleId ? { scheduleId } : {}),
        }
      : "skip",
  );
  const eventStatus = useQuery(
    api.eventChatMessages.getMyStatus,
    isAuthenticated && eventId ? { eventId } : "skip",
  );
  const chatStatus = eventId ? eventStatus : courseStatus;
  const isMuted = chatStatus?.isMuted ?? false;
  const isArchived = chatStatus?.archived ?? false;
  const canAttach = chatStatus?.canAttach === true;
  const isComposerDisabled =
    !isAuthenticated || chatStatus === undefined || isMuted || isSending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = body.trim();
    if ((!message && !files.length) || isComposerDisabled || sendingRef.current)
      return;
    if ((files.length || containsChatLink(message)) && !canAttach) {
      toast.error(t("attachmentsDisabled"));
      return;
    }

    sendingRef.current = true;
    setIsSending(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    if (files.length)
      setPending({
        body: message,
        files: files.map((entry) => entry.file),
        attachmentIds: files.flatMap((entry) => (entry.id ? [entry.id] : [])),
        cancel: () => controller.abort(),
      });
    try {
      const uploaded = [...files];
      for (let index = 0; index < uploaded.length; index++) {
        const entry = uploaded[index];
        if (!entry.id) {
          const file = await optimizeChatImage(entry.file);
          if (controller.signal.aborted) return;
          const response = await requestFile(
            eventId
              ? { eventId }
              : broadcastId
                ? { broadcastId }
                : { classId: courseId! },
            {
              method: "POST",
              signal: controller.signal,
              body: file,
              headers: {
                "Content-Type": file.type,
                "X-File-Name": encodeURIComponent(file.name),
                "X-File-Size": String(file.size),
              },
            },
          );
          const result: unknown = await response.json();
          if (
            !result ||
            typeof result !== "object" ||
            !("id" in result) ||
            typeof result.id !== "string"
          )
            throw new Error("UPLOAD_FAILED");
          uploaded[index] = {
            file,
            id: result.id as
              | Id<"courseChatAttachments">
              | Id<"eventChatAttachments">,
          };
          setFiles([...uploaded]);
          setPending(
            (current) =>
              current && {
                ...current,
                attachmentIds: uploaded.flatMap((item) =>
                  item.id ? [item.id] : [],
                ),
              },
          );
        }
      }
      if (controller.signal.aborted) return;
      setPending((current) => current && { ...current, cancel: null });
      if (eventId)
        await sendEventMessage({
          eventId,
          body: message,
          ...(uploaded.length
            ? {
                attachmentIds: uploaded.map(
                  (entry) => entry.id! as Id<"eventChatAttachments">,
                ),
              }
            : {}),
        });
      else
        await sendCourseMessage({
          ...(broadcastId ? { broadcastId } : { classId: courseId! }),
          ...(scheduleId ? { scheduleId } : {}),
          body: message,
          ...(uploaded.length
            ? {
                attachmentIds: uploaded.map(
                  (entry) => entry.id! as Id<"courseChatAttachments">,
                ),
              }
            : {}),
        });
      setBody("");
      setFiles([]);
    } catch (error) {
      if (controller.signal.aborted) return;
      const code =
        parseConvexError(error)?.code ??
        (error instanceof Error ? error.message : "");
      if (code === "INVALID_CHAT_ATTACHMENTS")
        setFiles((current) => current.map(({ file }) => ({ file })));
      toast.error(
        isRateLimitError(error)
          ? t("chatRateLimited", {
              seconds: Math.max(1, Math.ceil(error.data.retryAfter / 1000)),
            })
          : code === "CHAT_ATTACHMENTS_DISABLED"
            ? t("attachmentsDisabled")
            : files.length
              ? t("attachmentUploadError")
              : code === "CHAT_MUTED"
                ? t("chatMuted")
                : parseConvexError(error)?.code === "CHAT_ARCHIVED"
                  ? t("archivedChat")
                  : t("chatSendError"),
      );
    } finally {
      setIsSending(false);
      sendingRef.current = false;
      setPending(null);
    }
  };

  function selectFiles(selected: FileList | null) {
    if (!selected || !canAttach || isComposerDisabled) return;
    const next = [...files, ...Array.from(selected).map((file) => ({ file }))];
    if (
      next.length > MAX_CHAT_ATTACHMENTS ||
      next.some(({ file }) => !isValidChatFile(file)) ||
      next.reduce((sum, { file }) => sum + file.size, 0) >
        MAX_CHAT_MESSAGE_BYTES
    ) {
      toast.error(t("attachmentLimits"));
      return;
    }
    setFiles(next);
  }

  if (chatStatus?.readOnly === true) return null;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("shrink-0 bg-card p-2.5", className)}
    >
      <div className="mx-auto w-full max-w-4xl">
        {!isSending && files.length > 0 && (
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            {files.map((entry, index) => (
              <ChatFilePreview
                key={`${index}-${entry.file.name}`}
                file={entry.file}
                disabled={isSending}
                onRemove={() =>
                  setFiles((current) => current.filter((_, i) => i !== index))
                }
              />
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={CHAT_FILE_TYPES.join(",")}
          hidden
          disabled={!canAttach || isComposerDisabled}
          onChange={(event) => {
            selectFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="flex items-center gap-2">
          {canAttach && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <InputGroupButton
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-11 shrink-0 sm:size-12"
                  disabled={isComposerDisabled}
                  aria-label={t("attachFiles")}
                >
                  <Plus />
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
                  <Paperclip />
                  {t("addPhotosAndFiles")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <InputGroup className="h-11 min-w-0 flex-1 overflow-hidden bg-background sm:h-12">
            {eventId ? (
              <InputGroupInput
                value={isSending && files.length ? "" : body}
                onChange={(change) => setBody(change.target.value)}
                disabled={isComposerDisabled}
                maxLength={2000}
                placeholder={
                  isArchived
                    ? t("archivedChat")
                    : isMuted
                      ? t("chatMuted")
                      : t("chatPlaceholder")
                }
              />
            ) : (
              <CourseChatReferenceInput
                courseId={courseId!}
                value={isSending && files.length ? "" : body}
                onChange={setBody}
                disabled={isComposerDisabled}
                placeholder={
                  isArchived
                    ? t("archivedChat")
                    : isMuted
                      ? t(broadcastId ? "broadcasts.readOnly" : "chatMuted")
                      : t("chatPlaceholder")
                }
              />
            )}
            <InputGroupAddon
              align="inline-end"
              className="h-full shrink-0 py-0 pr-0 has-[>button]:mr-0"
            >
              <InputGroupButton
                variant="default"
                size="icon-sm"
                type="submit"
                disabled={(!body.trim() && !files.length) || isComposerDisabled}
                aria-label={t("sendMessage")}
                title={t("sendMessage")}
                className="h-full w-11 rounded-none focus-visible:ring-inset sm:w-12"
              >
                <SendHorizontal />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </div>
    </form>
  );
}
