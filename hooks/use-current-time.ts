"use client";

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export function useCurrentTime() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let timeout: number;
    const tick = () => {
      setNow(Date.now());
      timeout = window.setTimeout(
        tick,
        MINUTE_MS - (Date.now() % MINUTE_MS) + 25,
      );
    };
    timeout = window.setTimeout(
      tick,
      MINUTE_MS - (Date.now() % MINUTE_MS) + 25,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  return now;
}
