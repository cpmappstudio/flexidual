"use client";

import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { CourseChatMessage } from "@/components/chat/course-chat-message";
import { useClassroomChatNotification } from "@/hooks/use-classroom-chat-notification";
import { useNotificationChime } from "@/hooks/use-notification-chime";
import { useClassroomPresentation } from "./classroom-presentation";

export function ClassroomChatNotification({
  courseId,
  scheduleId,
  chatVisible,
  targetRef,
  onOpenChat,
}: {
  courseId: Id<"classes">;
  scheduleId?: Id<"classSchedule">;
  chatVisible: boolean;
  targetRef: RefObject<HTMLDivElement | null>;
  onOpenChat: () => void;
}) {
  const t = useTranslations("classroom");
  const presentation = useClassroomPresentation();
  const reducedMotion = useReducedMotion();
  const play = useNotificationChime({
    kind: "chat",
    ownerWindow: presentation?.ownerWindow,
  });
  const { message, dismiss } = useClassroomChatNotification({
    courseId,
    scheduleId,
    chatVisible,
    onNotify: play,
  });
  const target = targetRef.current;
  if (!target) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none absolute right-3 bottom-[var(--classroom-notification-bottom,0.75rem)] z-[60] w-fit max-w-[min(22rem,calc(100%_-_1.5rem))]"
    >
      <AnimatePresence>
        {message && (
          <motion.button
            key={message._id}
            type="button"
            initial={{ opacity: reducedMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: reducedMotion ? 1 : 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.15 }}
            className="pointer-events-auto block w-fit max-w-full cursor-pointer rounded-xl text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${t("openChat")}. ${message.authorName}: ${message.body || message.attachments?.map((file) => file.name).join(", ")}`}
            onClick={() => {
              dismiss();
              onOpenChat();
            }}
          >
            <CourseChatMessage message={message} preview />
          </motion.button>
        )}
      </AnimatePresence>
    </div>,
    target,
  );
}
