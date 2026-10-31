"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  ChatMessage,
  EventChatMessage,
} from "@/components/chat/course-chat-message";

const NOTIFICATION_DURATION = 6_000;
const SOUND_INTERVAL = 3_000;

export function useClassroomChatNotification({
  courseId,
  eventId,
  scheduleId,
  chatVisible,
  onNotify,
}: {
  courseId?: Id<"classes">;
  eventId?: Id<"events">;
  scheduleId?: Id<"classSchedule">;
  chatVisible: boolean;
  onNotify: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const coursePage = usePaginatedQuery(
    api.courseChatMessages.list,
    isAuthenticated && courseId
      ? { classId: courseId, ...(scheduleId ? { scheduleId } : {}) }
      : "skip",
    { initialNumItems: 10 },
  );
  const eventPage = usePaginatedQuery(
    api.eventChatMessages.list,
    isAuthenticated && eventId ? { eventId } : "skip",
    { initialNumItems: 10 },
  );
  const { results, status } = eventId ? eventPage : coursePage;
  const [message, setMessage] = useState<ChatMessage | EventChatMessage | null>(
    null,
  );
  const baselineRef = useRef<{
    courseId: string;
    time: number;
    ids: Set<string>;
  } | null>(null);
  const soundedAtRef = useRef<number | null>(null);
  const dismiss = useCallback(() => setMessage(null), []);

  useEffect(() => {
    if (!isAuthenticated) {
      baselineRef.current = null;
      soundedAtRef.current = null;
      setMessage(null);
      return;
    }
    if (status === "LoadingFirstPage") return;
    const baseline = baselineRef.current;
    const latestTime = results[0]?._creationTime ?? 0;
    const scope = eventId ? `event:${eventId}` : `${courseId}:${scheduleId}`;
    if (!baseline || baseline.courseId !== scope) {
      baselineRef.current = {
        courseId: scope,
        time: latestTime,
        ids: new Set(results.map((item) => item._id)),
      };
      soundedAtRef.current = null;
      setMessage(null);
      return;
    }
    const incoming = results.find(
      (item) =>
        !item.isOwn &&
        (item._creationTime > baseline.time ||
          (item._creationTime === baseline.time &&
            !baseline.ids.has(item._id))),
    );
    if (latestTime > baseline.time) {
      baseline.time = latestTime;
      baseline.ids.clear();
    }
    results.forEach((item) => {
      if (item._creationTime === baseline.time) baseline.ids.add(item._id);
    });
    if (chatVisible) setMessage(null);
    else if (incoming) {
      setMessage(incoming);
      const now = Date.now();
      if (
        soundedAtRef.current === null ||
        now - soundedAtRef.current >= SOUND_INTERVAL
      ) {
        soundedAtRef.current = now;
        onNotify();
      }
    } else if (message && !results.some((item) => item._id === message._id)) {
      setMessage(null);
    }
  }, [
    courseId,
    eventId,
    scheduleId,
    isAuthenticated,
    results,
    status,
    chatVisible,
    onNotify,
    message,
  ]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(dismiss, NOTIFICATION_DURATION);
    return () => window.clearTimeout(timer);
  }, [message, dismiss]);

  return {
    message:
      isAuthenticated &&
      !chatVisible &&
      message &&
      (eventId
        ? "eventId" in message && message.eventId === eventId
        : "classId" in message && message.classId === courseId)
        ? message
        : null,
    dismiss,
  };
}
