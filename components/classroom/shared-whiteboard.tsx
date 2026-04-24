"use client";

import { useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";

interface SharedWhiteboardProps {
  isReadonly?: boolean;
}

export function SharedWhiteboard({ isReadonly = false }: SharedWhiteboardProps) {
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));

  return (
    <div className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border">
      <Tldraw 
        store={store} 
        onMount={(editor) => {
          if (isReadonly) {
            editor.updateInstanceState({ isReadonly: true });
          }
        }}
      />
    </div>
  );
}