"use client";

import { useHydrated } from "./use-hydrated";
import { useMemo } from "react";

export function useBrowserTimeZone() {
  const hydrated = useHydrated();
  return useMemo(
    () =>
      hydrated ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
    [hydrated],
  );
}
