"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { TeacherIcon } from "@/components/teaching/teacher-icon";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { ChevronDown, Paperclip, Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChatAttachment } from "./course-chat-attachments";
import { ChatMessageText } from "./course-chat-message-text";
import { CourseEventAvatar, CourseEventContent } from "./course-event";

export type ChatMessage = FunctionReturnType<
  typeof api.courseChatMessages.list
>["page"][number];
export type EventChatMessage = FunctionReturnType<
  typeof api.eventChatMessages.list
>["page"][number];

export function CourseChatMessage({
  message,
  startsGroup = true,
  timeZone,
  canPin = false,
  preview = false,
}: {
  message: ChatMessage | EventChatMessage;
  startsGroup?: boolean;
  timeZone?: string;
  canPin?: boolean;
  preview?: boolean;
}) {
  const t = useTranslations("classroom");
  const format = useFormatter();
  const isOwn = message.isOwn;
  const isCourseEvent = "event" in message && Boolean(message.event);
  const isEventChat = "eventId" in message;
  const authorName = isCourseEvent
    ? t("courseEvents.sender")
    : message.authorName;
  const isTeacher = message.authorRole === "teacher";
  const variant =
    isOwn || isTeacher
      ? "default"
      : message.authorRole === "tutor"
        ? "tinted"
        : "secondary";

  return (
    <Message align={isOwn ? "end" : "start"}>
      {!preview && (
        <MessageAvatar className="bg-transparent">
          {startsGroup &&
            (isCourseEvent ? (
              <CourseEventAvatar />
            ) : (
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
            ))}
        </MessageAvatar>
      )}
      <MessageContent className="gap-1">
        <Bubble
          variant={isCourseEvent ? "event" : variant}
          className={cn(
            preview ? "max-w-full" : "max-w-[82%]",
            isCourseEvent && "w-full max-w-[min(24rem,100%)]",
          )}
        >
          <BubbleContent
            className={cn(
              "flex flex-col gap-0.5 px-2.5 py-1.5 text-sm leading-snug shadow-sm sm:text-base",
              startsGroup && (isOwn ? "rounded-br-sm" : "rounded-bl-sm"),
              preview && "px-3 py-2 shadow-lg",
              isCourseEvent && "w-full",
            )}
          >
            {startsGroup && (
              <span
                className={cn(
                  "text-xs font-bold sm:text-sm",
                  preview && "line-clamp-1 [overflow-wrap:anywhere]",
                )}
              >
                {authorName}
                {isTeacher && (
                  <>
                    {" "}
                    <TeacherIcon label={t("teacher")} />
                  </>
                )}
              </span>
            )}
            {preview && Boolean(message.attachments?.length) && (
              <span className="flex min-w-0 items-center gap-1 text-xs">
                <Paperclip className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {message.attachments?.map((file) => file.name).join(", ")}
                </span>
              </span>
            )}
            {!preview &&
              message.attachments?.map((file) => (
                <ChatAttachment
                  key={file.id}
                  file={file}
                  kind={isEventChat ? "event" : "course"}
                />
              ))}
            {isCourseEvent && (
              <CourseEventContent
                message={message as ChatMessage}
                preview={preview}
              />
            )}
            <div
              className={cn(
                "flex min-w-0 items-end gap-2",
                isCourseEvent && "justify-end",
              )}
            >
              {!isCourseEvent && (
                <p
                  className={cn(
                    "min-w-0 flex-1 text-left whitespace-pre-wrap [overflow-wrap:anywhere]",
                    preview && "line-clamp-3",
                  )}
                >
                  <ChatMessageText
                    body={message.body}
                    enabled={!preview && message.linksEnabled === true}
                    classId={
                      preview || isEventChat ? undefined : message.classId
                    }
                    availableTaskIds={
                      isEventChat ? undefined : message.availableTaskIds
                    }
                    plain={isEventChat}
                  />
                </p>
              )}
              {message.pinnedAt !== undefined && (
                <Pin
                  className="size-3 shrink-0 opacity-80"
                  aria-label={t("pinnedMessage")}
                />
              )}
              {!preview && (
                <time
                  className="mb-0.5 shrink-0 whitespace-nowrap text-[10px] leading-none opacity-80 sm:text-xs"
                  dateTime={new Date(message._creationTime).toISOString()}
                  title={timeZone}
                >
                  {timeZone &&
                    format.dateTime(message._creationTime, {
                      timeZone,
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                </time>
              )}
            </div>
            {canPin && !preview && <MessagePinMenu message={message} />}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

function MessagePinMenu({
  message,
}: {
  message: ChatMessage | EventChatMessage;
}) {
  const t = useTranslations("classroom");
  const setCoursePinned = useMutation(api.courseChatMessages.setPinned);
  const setEventPinned = useMutation(api.eventChatMessages.setPinned);
  const [saving, setSaving] = useState(false);
  const pinned = message.pinnedAt !== undefined;
  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if ("eventId" in message)
        await setEventPinned({ messageId: message._id, pinned: !pinned });
      else await setCoursePinned({ messageId: message._id, pinned: !pinned });
    } catch {
      toast.error(t("pinMessageError"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t("messageOptions")}
          className="absolute top-1 right-1 z-20 cursor-pointer border-0 bg-transparent text-inherit shadow-none hover:bg-transparent hover:text-inherit dark:hover:bg-transparent sm:opacity-0 sm:group-hover/bubble:opacity-100 sm:group-focus-within/bubble:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={saving} onSelect={() => void toggle()}>
          {pinned ? <PinOff /> : <Pin />}
          {t(pinned ? "unpinMessage" : "pinMessage")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
