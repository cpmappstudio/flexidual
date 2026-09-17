"use client";

import { useCallback, useEffect, useRef } from "react";

const CHIMES = {
  classroom: {
    notes: [
      [660, 0],
      [880, 0.18],
      [1100, 0.36],
    ],
    volume: 0.18,
    duration: 0.35,
    attack: 0.04,
    waveform: "sine" as const,
  },
  chat: {
    notes: [[1046.5, 0]],
    volume: 0.06,
    duration: 0.3,
    attack: 0.008,
    waveform: "triangle" as const,
  },
};

export function useNotificationChime({
  enabled = true,
  kind = "classroom",
  ownerWindow,
}: {
  enabled?: boolean;
  kind?: keyof typeof CHIMES;
  ownerWindow?: Window;
} = {}) {
  const contextRef = useRef<AudioContext | null>(null);
  const getContext = useCallback(() => {
    contextRef.current ??= new AudioContext();
    return contextRef.current;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      try {
        void getContext()
          .resume()
          .catch(() => {});
      } catch {
        /* Audio is optional. */
      }
    };
    const targets = new Set([window, ownerWindow ?? window]);
    targets.forEach((target) => {
      target.addEventListener("pointerdown", unlock);
      target.addEventListener("keydown", unlock);
    });
    return () =>
      targets.forEach((target) => {
        target.removeEventListener("pointerdown", unlock);
        target.removeEventListener("keydown", unlock);
      });
  }, [enabled, ownerWindow, getContext]);

  useEffect(
    () => () => {
      void contextRef.current?.close().catch(() => {});
      contextRef.current = null;
    },
    [enabled],
  );

  return useCallback(async () => {
    if (!enabled) return;
    if (kind === "chat" && contextRef.current?.state !== "running") return;
    try {
      const context = getContext();
      if (context.state === "suspended") await context.resume();
      if (context.state !== "running") return;
      const { notes, volume, duration, attack, waveform } = CHIMES[kind];
      const start = context.currentTime;
      notes.forEach(([frequency, delay]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.type = waveform;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start + delay);
        gain.gain.linearRampToValueAtTime(volume, start + delay + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, start + delay + duration);
        oscillator.start(start + delay);
        oscillator.stop(start + delay + duration);
      });
    } catch {
      /* A blocked chime must not interrupt the classroom. */
    }
  }, [enabled, kind, getContext]);
}
