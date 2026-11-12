"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

const serverSnapshot = () => null;

function decodeStoredDraft<T>(
  raw: string | null,
  decode: (value: unknown) => T | undefined,
) {
  try {
    return decode(JSON.parse(raw ?? "null"));
  } catch {
    return undefined;
  }
}

export function useSessionDraft<T>(
  key: string | undefined,
  decode: (value: unknown) => T | undefined,
) {
  const [state, setState] = useState<{ key: string; draft?: T }>();
  const snapshot = useCallback(() => {
    try {
      return key ? sessionStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const persisted = useMemo(() => decodeStoredDraft(raw, decode), [raw, decode]);
  const draft = state?.key === key ? state?.draft : persisted;

  function setDraft(value: T | undefined) {
    if (!key) return;
    setState({ key, draft: value });
    try {
      if (value !== undefined)
        sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch {
      /* A full browser store must not block saving to Convex. */
    }
  }
  function clearDraftIf(matches: (value: T) => boolean) {
    if (!key) return;
    setState((current) =>
      current?.key === key && current.draft !== undefined && matches(current.draft)
        ? { key }
        : current,
    );
    // The editor may have been reopened while the save was in flight.
    const latest = decodeStoredDraft(snapshot(), decode);
    if (latest !== undefined && matches(latest)) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Storage may no longer be available. */
      }
    }
  }

  return { draft, setDraft, clearDraftIf };
}
