"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";

// Minimal interface for the subset of Editor methods used externally
export type TLEditorInstance = {
  toImage: (ids: string[], opts?: Record<string, unknown>) => Promise<{ blob: Blob }>;
  getCurrentPageShapeIds: () => Set<string>;
  updateInstanceState: (state: Record<string, unknown>) => void;
};

interface SharedWhiteboardProps {
  isReadonly?: boolean;
  onEditorReady?: (editor: TLEditorInstance) => void;
}

export function SharedWhiteboard({ isReadonly = false, onEditorReady }: SharedWhiteboardProps) {
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));
  const internalEditorRef = useRef<TLEditorInstance | null>(null);

  // On mobile, browsers periodically steal document focus, causing Tldraw to set
  // isFocused=false and hide the entire UI. Re-assert on a short interval to prevent this.
  useEffect(() => {
    if (isReadonly) return;
    const id = setInterval(() => {
      internalEditorRef.current?.updateInstanceState({ isFocused: true });
    }, 300);
    return () => clearInterval(id);
  }, [isReadonly]);

  return (
    <div className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border touch-none overscroll-none">
      <Tldraw
        store={store}
        autoFocus
        onMount={(editor) => {
          // Keep the editor's focus state active so the toolbar never hides
          internalEditorRef.current = editor as unknown as TLEditorInstance;
          editor.updateInstanceState({ isFocused: true });
          onEditorReady?.(editor as unknown as TLEditorInstance);
          if (isReadonly) {
            editor.updateInstanceState({ isReadonly: true });
          }
        }}
      />
    </div>
  );
}