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

  // On mobile, browser focus management sets isFocused=false which hides the Tldraw UI.
  // We reassert via updateInstanceState (NOT editor.focus() — that triggers the virtual
  // keyboard, which changes window.innerHeight, which causes layout shifts → blank canvas).
  useEffect(() => {
    if (isReadonly) return;
    const assert = () =>
      internalEditorRef.current?.updateInstanceState({ isFocused: true });
    const id = setInterval(assert, 300);
    return () => clearInterval(id);
  }, [isReadonly]);

  return (
    // onPointerDown asserts focus before each drawing gesture so the first stroke
    // is never blocked by a brief isFocused=false window.
    <div
      className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border touch-none overscroll-none"
      onPointerDown={() =>
        internalEditorRef.current?.updateInstanceState({ isFocused: true })
      }
    >
      <Tldraw
        store={store}
        onMount={(editor) => {
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