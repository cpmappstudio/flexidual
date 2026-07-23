"use client";

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

function currentMinute() {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

export function useCurrentMinute() {
  const [now, setNow] = useState(currentMinute);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(currentMinute()), MINUTE_MS);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}
