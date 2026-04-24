"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";

// Minimal interface for the subset of Editor methods used externally
export type TLEditorInstance = {
  focus: () => void;
  toImage: (ids: string[], opts?: Record<string, unknown>) => Promise<{ blob: Blob }>;
  getSvgString: (ids: string[], opts?: Record<string, unknown>) => Promise<{ svg: string; width: number; height: number } | undefined>;
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

  // editor.focus() moves actual DOM focus — unlike updateInstanceState({ isFocused: true }),
  // it is respected by Tldraw's own focus detector and won't be immediately overridden.
  useEffect(() => {
    if (isReadonly) return;
    const refocus = () => internalEditorRef.current?.focus();
    // Re-focus when the browser tab/app regains visibility (most common mobile case)
    const onVisibility = () => { if (!document.hidden) refocus(); };
    document.addEventListener("visibilitychange", onVisibility);
    // 1-second fallback for any other focus-steal scenario on mobile
    const id = setInterval(refocus, 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(id);
    };
  }, [isReadonly]);

  return (
    <div className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border touch-none overscroll-none">
      <Tldraw
        store={store}
        autoFocus
        onMount={(editor) => {
          internalEditorRef.current = editor as unknown as TLEditorInstance;
          // Call editor.focus() — this moves real DOM focus so Tldraw's own
          // focus detection confirms it and doesn't reset isFocused to false.
          editor.focus();
          onEditorReady?.(editor as unknown as TLEditorInstance);
          if (isReadonly) {
            editor.updateInstanceState({ isReadonly: true });
          }
        }}
      />
    </div>
  );
}