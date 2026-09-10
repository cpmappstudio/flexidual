"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import { MessageScrollerItem } from "@/components/ui/message-scroller";
import { Progress } from "@/components/ui/progress";
import { ChatFilePreview } from "./course-chat-attachments";

export interface PendingChatUpload {
  body: string;
  files: File[];
  attachmentIds: Id<"courseChatAttachments">[];
  cancel: (() => void) | null;
}

const PendingChatContext = createContext<{
  pending: PendingChatUpload | null;
  setPending: Dispatch<SetStateAction<PendingChatUpload | null>>;
} | null>(null);

export function CourseChatUploadProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pending, setPending] = useState<PendingChatUpload | null>(null);
  return (
    <PendingChatContext.Provider value={{ pending, setPending }}>
      {children}
    </PendingChatContext.Provider>
  );
}

export function usePendingChatUpload() {
  const context = useContext(PendingChatContext);
  if (!context) throw new Error("CourseChatUploadProvider is required");
  return context;
}

export function PendingChatMessage({
  confirmedAttachmentIds,
}: {
  confirmedAttachmentIds: string[];
}) {
  const context = useContext(PendingChatContext);
  const t = useTranslations("classroom");
  const pending = context?.pending;
  if (
    !pending ||
    pending.attachmentIds.some((id) => confirmedAttachmentIds.includes(id))
  )
    return null;
  const completed = pending.attachmentIds.length;
  const label = t("uploadingAttachments", {
    current: completed,
    total: pending.files.length,
  });
  return (
    <MessageScrollerItem messageId="pending-upload" className="pt-3">
      <Message align="end" aria-busy="true">
        <MessageAvatar className="bg-transparent" />
        <MessageContent>
          <Bubble className="max-w-[82%]">
            <BubbleContent className="flex w-72 flex-col gap-2 rounded-br-sm px-2.5 py-1.5 shadow-sm">
              {pending.files.map((file, index) => (
                <ChatFilePreview
                  key={index}
                  file={file}
                  state={pending.cancel ? "uploading" : "processing"}
                />
              ))}
              {pending.body && (
                <p className="text-left text-sm whitespace-pre-wrap [overflow-wrap:anywhere] sm:text-base">
                  {pending.body}
                </p>
              )}
              <div className="flex h-7 items-center gap-2">
                <Progress
                  value={
                    completed
                      ? (completed / pending.files.length) * 100
                      : undefined
                  }
                  aria-label={label}
                  className="h-1 bg-primary-foreground/20"
                  indicatorClassName={
                    completed
                      ? "bg-primary-foreground"
                      : "bg-primary-foreground w-1/3 !translate-x-0 motion-safe:animate-pulse"
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  disabled={!pending.cancel}
                  onClick={() => pending.cancel?.()}
                  aria-label={t("cancelAttachmentUpload")}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}
