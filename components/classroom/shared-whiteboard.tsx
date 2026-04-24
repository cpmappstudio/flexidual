"use client";

import { useEffect, useRef } from "react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export type TLEditorInstance = {
  getContainer: () => HTMLElement;
  toImage: (ids: string[], opts?: Record<string, unknown>) => Promise<{ blob: Blob }>;
  getCurrentPageShapeIds: () => Set<string>;
  updateInstanceState: (state: Record<string, unknown>) => void;
  store: {
    listen: (handler: (update: unknown) => void, opts?: { source?: string; scope?: string }) => () => void;
  };
};

interface SharedWhiteboardProps {
  isReadonly?: boolean;
  onEditorReady?: (editor: TLEditorInstance) => void;
}

export function SharedWhiteboard({ isReadonly = false, onEditorReady }: SharedWhiteboardProps) {
  const focusCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => focusCleanupRef.current?.();
  }, []);

  return (
    <div className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border touch-none overscroll-none">
      <Tldraw
        onMount={(editor) => {
          onEditorReady?.(editor as unknown as TLEditorInstance);

          if (isReadonly) {
            editor.updateInstanceState({ isReadonly: true });
            return;
          }

          const container = editor.getContainer();
          container.focus();

          // Focus trap: any time focus escapes the Tldraw container, immediately re-capture it.
          // This fires synchronously before Tldraw's 32ms debounce can set isFocused=false,
          // preventing the toolbar/tools from going blank on mobile.
          const handleFocusOut = (e: FocusEvent) => {
            const relatedTarget = e.relatedTarget as Node | null;
            // Only re-trap if focus moved OUTSIDE the container (not between child elements)
            if (!container.contains(relatedTarget)) {
              requestAnimationFrame(() => container.focus());
            }
          };
          container.addEventListener("focusout", handleFocusOut);
          focusCleanupRef.current = () =>
            container.removeEventListener("focusout", handleFocusOut);
        }}
      />
    </div>
  );
}

