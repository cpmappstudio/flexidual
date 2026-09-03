"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export type ClassroomTokenError = "not-started" | "connection";

interface UseClassroomTokenOptions {
  roomName: string;
  userId: string | undefined;
  isCompanion: boolean;
  shouldRequest: boolean;
}

interface ClassroomTokenState {
  scopeKey: string;
  token: string;
  error: ClassroomTokenError | null;
}

export function useClassroomToken({
  roomName,
  userId,
  isCompanion,
  shouldRequest,
}: UseClassroomTokenOptions) {
  const getToken = useAction(api.livekit.getToken);
  const scopeKey = `${roomName}:${userId ?? "anonymous"}:${isCompanion ? "companion" : "primary"}`;
  const [state, setState] = useState<ClassroomTokenState>({
    scopeKey,
    token: "",
    error: null,
  });
  const [retryVersion, setRetryVersion] = useState(0);
  const lastStartedRequestRef = useRef<string | null>(null);

  const isCurrentScope = state.scopeKey === scopeKey;
  const token = isCurrentScope ? state.token : "";
  const error = isCurrentScope ? state.error : null;
  const requestKey =
    shouldRequest && userId && !token ? `${scopeKey}:${retryVersion}` : null;
  const currentRequestRef = useRef(requestKey);
  currentRequestRef.current = requestKey;

  useEffect(() => {
    if (!requestKey || lastStartedRequestRef.current === requestKey) return;

    lastStartedRequestRef.current = requestKey;
    setState({ scopeKey, token: "", error: null });

    void getToken({ roomName, isCompanion })
      .then((jwt) => {
        if (currentRequestRef.current !== requestKey) return;
        setState({ scopeKey, token: jwt, error: null });
      })
      .catch((requestError: unknown) => {
        if (currentRequestRef.current !== requestKey) return;
        console.error("Error fetching classroom token:", requestError);
        const message =
          requestError instanceof Error ? requestError.message : "";
        setState({
          scopeKey,
          token: "",
          error: message.includes("not started") ? "not-started" : "connection",
        });
      });
  }, [getToken, isCompanion, requestKey, roomName, scopeKey]);

  const clear = useCallback(() => {
    setState((current) =>
      current.scopeKey === scopeKey ? { ...current, token: "" } : current,
    );
  }, [scopeKey]);

  const retry = useCallback(() => {
    setState({ scopeKey, token: "", error: null });
    setRetryVersion((current) => current + 1);
  }, [scopeKey]);

  return { token, error, clear, retry };
}
