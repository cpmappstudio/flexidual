"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";
import { ArrowDown, SendHorizontal } from "lucide-react";

export interface ClassroomChatMockCopy {
  description: string;
  teacherLabel: string;
  studentLabel: string;
  youLabel: string;
  teacherMessage: string;
  studentMessage: string;
  ownMessage: string;
  placeholder: string;
  sendLabel: string;
  scrollToLatestLabel: string;
}

interface ClassroomChatMockProps {
  copy: ClassroomChatMockCopy;
  className?: string;
}

export function ClassroomChatMock({ copy, className }: ClassroomChatMockProps) {
  const messages = [
    {
      author: copy.teacherLabel,
      initials: "P",
      message: copy.teacherMessage,
      time: "10:02",
      tone: "teacher",
    },
    {
      author: copy.studentLabel,
      initials: "S",
      message: copy.studentMessage,
      time: "10:03",
      tone: "student",
    },
    {
      author: copy.youLabel,
      initials: "T",
      message: copy.ownMessage,
      time: "10:04",
      tone: "own",
    },
  ] as const;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      <p className="border-b border-primary/15 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        {copy.description}
      </p>

      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-4 px-3 py-4">
              <MessageGroup className="gap-4">
                {messages.map((message) => {
                  const isOwn = message.tone === "own";
                  const variant =
                    message.tone === "teacher"
                      ? "tinted"
                      : message.tone === "student"
                        ? "secondary"
                        : "default";

                  return (
                    <Message
                      key={`${message.author}-${message.time}`}
                      align={isOwn ? "end" : "start"}
                    >
                      <MessageAvatar className="bg-transparent">
                        <Avatar size="sm" className="shrink-0 shadow-sm">
                          <AvatarFallback
                            className={cn(
                              message.tone === "teacher" &&
                                "bg-primary text-primary-foreground",
                              message.tone === "student" &&
                                "bg-secondary text-secondary-foreground",
                              isOwn && "bg-info text-info-foreground",
                            )}
                          >
                            {message.initials}
                          </AvatarFallback>
                        </Avatar>
                      </MessageAvatar>
                      <MessageContent className="gap-1">
                        <MessageHeader
                          className={cn(
                            "gap-1.5 text-[10px]",
                            isOwn && "justify-end",
                          )}
                        >
                          <span className="truncate font-semibold">
                            {message.author}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{message.time}</span>
                        </MessageHeader>
                        <Bubble
                          align={isOwn ? "end" : "start"}
                          variant={variant}
                          className="max-w-[82%]"
                        >
                          <BubbleContent
                            className={cn(
                              "text-xs shadow-sm",
                              isOwn ? "rounded-br-sm" : "rounded-bl-sm",
                            )}
                          >
                            {message.message}
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  );
                })}
              </MessageGroup>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton>
            <ArrowDown />
            <span className="sr-only">{copy.scrollToLatestLabel}</span>
          </MessageScrollerButton>
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="shrink-0 border-t border-primary/20 bg-card p-2.5">
        <InputGroup className="h-10 bg-background">
          <InputGroupInput
            readOnly
            aria-disabled="true"
            placeholder={copy.placeholder}
            className="text-xs"
          />
          <InputGroupAddon align="inline-end" className="pr-1">
            <InputGroupButton
              type="button"
              variant="default"
              size="icon-sm"
              disabled
              aria-label={copy.sendLabel}
              title={copy.sendLabel}
              className="rounded-full"
            >
              <SendHorizontal />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
}
