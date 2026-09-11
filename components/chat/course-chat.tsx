"use client";

import { CourseChatMessage } from "./course-chat-message";
import { useDocumentActive } from "@/hooks/use-document-active";
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
  courseId: Id<"classes">;
  className?: string;
}

const MAX_MESSAGE_GROUP_SIZE = 6;

export function CourseChat({ courseId, className }: CourseChatProps) {
  return (
    <CourseChatUploadProvider key={courseId}>
      <div
        data-course-chat-id={courseId}
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden bg-card",
          className,
        )}
      >
        <CourseChatMessages courseId={courseId} />
        <CourseChatComposer
          courseId={courseId}
          className="border-t border-primary/20"
        />
      </div>
    </CourseChatUploadProvider>
  );
}

export function CourseChatMessages({ courseId, className }: CourseChatProps) {
  const t = useTranslations("classroom");
  const format = useFormatter();
  const [timeZone, setTimeZone] = useState<string>();
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  const { isAuthenticated } = useConvexAuth();
  const chatStatus = useQuery(
    api.courseChatMessages.getMyStatus,
    isAuthenticated ? { classId: courseId } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseChatMessages.list,
    isAuthenticated ? { classId: courseId } : "skip",
    { initialNumItems: 40 },
  );
  const messages = useMemo(() => {
    const chronological = [...results].reverse();
    let previousDay: string | undefined;
    let groupSize = 0;
    return chronological.map((message, index) => {
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
        message.authorId !== chronological[index - 1].authorId ||
        groupSize === MAX_MESSAGE_GROUP_SIZE;
      groupSize = startsGroup ? 1 : groupSize + 1;
      previousDay = day;
      return { message, day, startsDay, startsGroup };
    });
  }, [results, timeZone, format]);

  return (
    <div
      data-course-chat-id={courseId}
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <ChatReadReceipt messageId={results[0]?._id} />
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-1 px-3 py-4">
              <MessageScrollerItem messageId="chat-visibility-note">
                <Marker variant="separator">
                  <MarkerContent className="text-xs leading-relaxed sm:text-sm">
                    {t("classChatDescription")}
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
                        message={message}
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
}: {
  messageId?: Id<"courseChatMessages">;
}) {
  const { visibleMessageIds } = useMessageScrollerVisibility();
  const markRead = useMutation(api.courseChatNotifications.markRead);
  const isFocused = useDocumentActive();
  const isVisible = Boolean(messageId && visibleMessageIds.includes(messageId));
  useEffect(() => {
    if (messageId && isVisible && isFocused) {
      void markRead({ messageId }).catch((error) =>
        console.error("Chat read receipt failed", error),
      );
    }
  }, [messageId, isVisible, isFocused, markRead]);
  return null;
}

export function CourseChatComposer({
  courseId,
  className,
}: {
  courseId: Id<"classes">;
  className?: string;
}) {
  return (
    <ChatComposer key={courseId} courseId={courseId} className={className} />
  );
}

function ChatComposer({
  courseId,
  className,
}: {
  courseId: Id<"classes">;
  className?: string;
}) {
  const t = useTranslations("classroom");
  const { isAuthenticated } = useConvexAuth();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [files, setFiles] = useState<
    { file: File; id?: Id<"courseChatAttachments"> }[]
  >([]);
  const { setPending } = usePendingChatUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestFile = useChatFileRequest();
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      setPending(null);
    },
    [setPending],
  );
  const sendMessage = useMutation(api.courseChatMessages.send);
  const chatStatus = useQuery(
    api.courseChatMessages.getMyStatus,
    isAuthenticated ? { classId: courseId } : "skip",
  );
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
            { classId: courseId },
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
            id: result.id as Id<"courseChatAttachments">,
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
      await sendMessage({
        classId: courseId,
        body: message,
        ...(uploaded.length
          ? { attachmentIds: uploaded.map((entry) => entry.id!) }
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
        code === "CHAT_ATTACHMENTS_DISABLED"
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
            <InputGroupInput
              value={isSending && files.length ? "" : body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
              disabled={isComposerDisabled}
              placeholder={
                isArchived
                  ? t("archivedChat")
                  : isMuted
                    ? t("chatMuted")
                    : t("chatPlaceholder")
              }
              className="text-sm sm:text-base"
            />
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
