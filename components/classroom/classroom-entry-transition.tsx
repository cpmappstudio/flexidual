"use client";

import { useCallback, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ClassroomEntryLoader } from "./classroom-entry-loader";

export function ClassroomEntryTransition({
  enabled,
  loading,
  label,
  children,
}: {
  enabled: boolean;
  loading: boolean;
  label: string;
  children: ReactNode;
}) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  const shouldReduceMotion = Boolean(useReducedMotion());
  const completeAnimation = useCallback(() => setIsAnimationComplete(true), []);

  const [previousInput, setPreviousInput] = useState({
    enabled: false,
    loading: false,
    shouldReduceMotion: false,
  });
  if (
    previousInput.enabled !== enabled ||
    previousInput.loading !== loading ||
    previousInput.shouldReduceMotion !== shouldReduceMotion
  ) {
    setPreviousInput({ enabled, loading, shouldReduceMotion });
    if (!enabled) setIsAnimationComplete(false);
    else if (shouldReduceMotion) setIsAnimationComplete(true);
    else if (loading) setIsAnimationComplete(false);
  }

  const showEntry =
    enabled && (loading || (!shouldReduceMotion && !isAnimationComplete));

  return (
    <div className="relative h-full min-h-0 w-full">
      <div className="h-full min-h-0 w-full" inert={showEntry}>
        {children}
      </div>
      {enabled && (
        <AnimatePresence>
          {showEntry && (
            <motion.div
              key="classroom-entry"
              className="absolute inset-0 z-40 bg-inverse"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.25,
                delay: shouldReduceMotion ? 0 : 0.3,
              }}
            >
              <ClassroomEntryLoader
                label={label}
                onComplete={completeAnimation}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
