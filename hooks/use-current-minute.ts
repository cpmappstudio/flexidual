"use client";

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export function getCurrentMinute() {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

export function useCurrentMinute() {
  const [now, setNow] = useState(getCurrentMinute);

  useEffect(() => {
    let timeout: number;

    const scheduleNextMinute = () => {
      const delay = MINUTE_MS - (Date.now() % MINUTE_MS);
      timeout = window.setTimeout(() => {
        setNow(getCurrentMinute());
        scheduleNextMinute();
      }, delay);
    };

    scheduleNextMinute();
    return () => window.clearTimeout(timeout);
  }, []);

  return now;
}
