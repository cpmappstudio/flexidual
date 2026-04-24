"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";

// Minimal interface for the subset of Editor methods used externally
export type TLEditorInstance = {
  getContainer: () => HTMLElement;
  toImage: (ids: string[], opts?: Record<string, unknown>) => Promise<{ blob: Blob }>;
  getCurrentPageShapeIds: () => Set<string>;
  updateInstanceState: (state: Record<string, unknown>) => void;
  store: { listen: (handler: () => void, opts?: { source?: string; scope?: string }) => () => void };
};

interface SharedWhiteboardProps {
  isReadonly?: boolean;
  onEditorReady?: (editor: TLEditorInstance) => void;
}

export function SharedWhiteboard({ isReadonly = false, onEditorReady }: SharedWhiteboardProps) {
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));
  const internalEditorRef = useRef<TLEditorInstance | null>(null);

  // Tldraw sets isFocused via a debounced handler that checks:
  //   document.hasFocus() && container.contains(document.activeElement)
  // On mobile, touch events don't move DOM focus to the container, so activeElement
  // stays as document.body and isFocused goes false after 32ms.
  // The ONLY fix that satisfies Tldraw's own check is editor.getContainer().focus() —
  // the same call Tldraw uses internally (see DefaultContextMenu, StylePanel, etc.)
  useEffect(() => {
    if (isReadonly) return;
    const focusContainer = () => internalEditorRef.current?.getContainer().focus();
    // Re-focus on every pointer interaction (covers all drawing gestures)
    document.addEventListener("pointerdown", focusContainer, { capture: true });
    // Re-focus when tab/app becomes visible again
    const onVisibility = () => { if (!document.hidden) focusContainer(); };
    document.addEventListener("visibilitychange", onVisibility);
    // Fallback interval — catches any remaining edge cases without flooding
    const id = setInterval(focusContainer, 500);
    return () => {
      document.removeEventListener("pointerdown", focusContainer, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(id);
    };
  }, [isReadonly]);

  return (
    <div className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border touch-none overscroll-none">
      <Tldraw
        store={store}
        onMount={(editor) => {
          internalEditorRef.current = editor as unknown as TLEditorInstance;
          // Use the same call Tldraw uses internally for focus management
          editor.getContainer().focus();
          onEditorReady?.(editor as unknown as TLEditorInstance);
          if (isReadonly) {
            editor.updateInstanceState({ isReadonly: true });
          }
        }}
      />
    </div>
  );
}