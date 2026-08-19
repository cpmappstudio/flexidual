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
    const timer = window.setInterval(
      () => setNow(Date.now()),
      CLASSROOM_CLOCK_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  return now;
}
