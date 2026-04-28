"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useFullscreen } from "@/hooks/use-fullscreen";

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
  /** Extra Tailwind classes for positioning/styling */
  className?: string;
  compact?: boolean;
}

/**
 * Renders a single icon button to enter/exit fullscreen.
 * Detects browser support internally and returns null when unavailable
 * (e.g. iOS Safari), so callers never need to guard against it.
 */
export function FullscreenButton({ isFullscreen, onToggle, className = "", compact = false }: FullscreenButtonProps) {
  const { isSupported } = useFullscreen();
  if (!isSupported) return null;

  const size = compact ? "w-11 h-11" : "w-12 h-12";
  const iconSize = compact ? "w-5 h-5" : "w-5 h-5";

  return (
    <button
      onClick={onToggle}
      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      className={`
        ${size} rounded-full flex items-center justify-center transition-all shadow-md border
        bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border
        ${className}
      `}
    >
      {isFullscreen ? (
        <Minimize2 className={iconSize} />
      ) : (
        <Maximize2 className={iconSize} />
      )}
    </button>
  );
}

/** Compact variant for the phone-landscape floating overlay (white-on-dark). */
export function FullscreenButtonCompact({ isFullscreen, onToggle }: Pick<FullscreenButtonProps, "isFullscreen" | "onToggle">) {
  const { isSupported } = useFullscreen();
  if (!isSupported) return null;

  return (
    <button
      onClick={onToggle}
      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      className="w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 bg-white/20 text-white border-white/30 hover:bg-white/30"
    >
      {isFullscreen ? (
        <Minimize2 className="w-5 h-5" />
      ) : (
        <Maximize2 className="w-5 h-5" />
      )}
    </button>
  );
}
