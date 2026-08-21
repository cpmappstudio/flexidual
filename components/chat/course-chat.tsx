"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Marker, MarkerContent } from "@/components/ui/marker";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
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
import { ArrowDown, LoaderCircle, SendHorizontal } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

interface CourseChatProps {
  courseId: Id<"classes">;
  className?: string;
}

export function CourseChat({ courseId, className }: CourseChatProps) {
  return (
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
  );
}

export function CourseChatMessages({ courseId, className }: CourseChatProps) {
  const t = useTranslations("classroom");
  const format = useFormatter();
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseChatMessages.list,
    isAuthenticated ? { classId: courseId } : "skip",
    { initialNumItems: 40 },
  );
  const messages = useMemo(() => [...results].reverse(), [results]);

  return (
    <div
      data-course-chat-id={courseId}
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-4 px-3 py-4">
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
              {messages.map((message) => {
                const isOwn = message.isOwn;
                const variant = isOwn
                  ? "default"
                  : message.authorRole === "teacher" ||
                      message.authorRole === "tutor"
                    ? "tinted"
                    : "secondary";

                return (
                  <MessageScrollerItem
                    key={message._id}
                    messageId={message._id}
                  >
                    <Message align={isOwn ? "end" : "start"}>
                      <MessageAvatar className="bg-transparent">
                        <Avatar size="sm" className="shrink-0 shadow-sm">
                          <AvatarImage
                            src={message.authorImageUrl}
                            alt={message.authorName}
                          />
                          <AvatarFallback
                            className={cn(
                              message.authorRole === "teacher" &&
                                "bg-primary text-primary-foreground",
                              message.authorRole === "member" &&
                                "bg-secondary text-secondary-foreground",
                              isOwn && "bg-info text-info-foreground",
                            )}
                          >
                            {message.authorName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </MessageAvatar>
                      <MessageContent className="gap-1">
                        <MessageHeader
                          className={cn(
                            "gap-1.5 text-xs sm:text-sm",
                            isOwn && "justify-end",
                          )}
                        >
                          <span className="truncate font-semibold">
                            {message.authorName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {format.dateTime(new Date(message._creationTime), {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </MessageHeader>
                        <Bubble variant={variant} className="max-w-[82%]">
                          <BubbleContent
                            className={cn(
                              "text-sm leading-relaxed shadow-sm sm:text-base",
                              isOwn ? "rounded-br-sm" : "rounded-bl-sm",
                            )}
                          >
                            {message.body}
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
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

export function CourseChatComposer({
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
  const sendMessage = useMutation(api.courseChatMessages.send);
  const chatStatus = useQuery(
    api.courseChatMessages.getMyStatus,
    isAuthenticated ? { classId: courseId } : "skip",
  );
  const isMuted = chatStatus?.isMuted ?? false;
  const isArchived = chatStatus?.archived ?? false;
  const isComposerDisabled =
    !isAuthenticated || chatStatus === undefined || isMuted || isSending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = body.trim();
    if (!message || isComposerDisabled) return;

    setIsSending(true);
    try {
      await sendMessage({ classId: courseId, body: message });
      setBody("");
    } catch (error) {
      toast.error(
        parseConvexError(error)?.code === "CHAT_MUTED"
          ? t("chatMuted")
          : parseConvexError(error)?.code === "CHAT_ARCHIVED"
            ? t("archivedChat")
            : t("chatSendError"),
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("shrink-0 bg-card p-2.5", className)}
    >
      <div className="mx-auto w-full max-w-4xl">
        <InputGroup className="h-11 bg-background sm:h-12">
          <InputGroupInput
            value={body}
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
          <InputGroupAddon align="inline-end" className="pr-1">
            <InputGroupButton
              variant="default"
              size="icon-sm"
              type="submit"
              disabled={!body.trim() || isComposerDisabled}
              aria-label={t("sendMessage")}
              title={t("sendMessage")}
              className="rounded-full"
            >
              <SendHorizontal />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </form>
  );
}
