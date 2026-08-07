"use client";

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export function getCurrentMinute() {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

export function useCurrentMinute() {
  const [now, setNow] = useState(getCurrentMinute);

  useEffect(() => {
    const interval = window.setInterval(
      () => setNow(getCurrentMinute()),
      MINUTE_MS,
    );
    return () => window.clearInterval(interval);
  }, []);

  return now;
}
