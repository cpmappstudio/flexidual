"use client";

import { useEffect, useState } from "react";

const CLASSROOM_CLOCK_INTERVAL_MS = 1_000;
const CLASSROOM_QUERY_BUCKET_MS = 15_000;

export function getClassroomQueryNow(now: number) {
  return (
    Math.floor(now / CLASSROOM_QUERY_BUCKET_MS) * CLASSROOM_QUERY_BUCKET_MS
  );
}

export function useClassroomClock() {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") updateNow();
    };
    const timer = window.setInterval(updateNow, CLASSROOM_CLOCK_INTERVAL_MS);
    window.addEventListener("focus", updateNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return now;
}
