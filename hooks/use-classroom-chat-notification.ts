"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatMessage } from "@/components/chat/course-chat-message";

const NOTIFICATION_DURATION = 6_000;
const SOUND_INTERVAL = 3_000;

export function useClassroomChatNotification({
  courseId,
  chatVisible,
  onNotify,
}: {
  courseId: Id<"classes">;
  chatVisible: boolean;
  onNotify: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const { results, status } = usePaginatedQuery(
    api.courseChatMessages.list,
    isAuthenticated ? { classId: courseId } : "skip",
    { initialNumItems: 10 },
  );
  const [message, setMessage] = useState<ChatMessage | null>(null);
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
    if (!baseline || baseline.courseId !== courseId) {
      baselineRef.current = {
        courseId,
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
  }, [courseId, isAuthenticated, results, status, chatVisible, onNotify, message]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(dismiss, NOTIFICATION_DURATION);
    return () => window.clearTimeout(timer);
  }, [message, dismiss]);

  return {
    message:
      isAuthenticated && !chatVisible && message?.classId === courseId
        ? message
        : null,
    dismiss,
  };
}
