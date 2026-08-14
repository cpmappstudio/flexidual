"use client";

import { useEffect, useRef } from "react";

export function useRetainedQueryResult<T>(
  result: T | undefined,
  scopeKey: string,
) {
  const retainedRef = useRef<{ scopeKey: string; result: T } | null>(null);

  useEffect(() => {
    if (result !== undefined) {
      retainedRef.current = { scopeKey, result };
    }
  }, [result, scopeKey]);

  if (result !== undefined) return result;
  return retainedRef.current?.scopeKey === scopeKey
    ? retainedRef.current.result
    : undefined;
}
