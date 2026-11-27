"use client";

import { useEffect, useRef } from "react";

export function useCourseQuizCopyProtection<T extends HTMLElement>(
  enabled = true,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;
    const preventCopy = (event: ClipboardEvent) => {
      const content = ref.current;
      if (!content) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable="true"]')
      )
        return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      for (let index = 0; index < selection.rangeCount; index++) {
        if (selection.getRangeAt(index).intersectsNode(content)) {
          event.preventDefault();
          return;
        }
      }
    };
    document.addEventListener("copy", preventCopy);
    return () => document.removeEventListener("copy", preventCopy);
  }, [enabled]);

  return ref;
}
