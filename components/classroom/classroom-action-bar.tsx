"use client";

import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import { useClassroomPresentation } from "./classroom-presentation";

const COMPACT_CONTROLS_QUERY = "(max-width: 1023px)";

function subscribeToControlsLayout(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const mediaQuery = window.matchMedia(COMPACT_CONTROLS_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getCompactControlsSnapshot() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.(COMPACT_CONTROLS_QUERY).matches)
  );
}

function getServerControlsSnapshot() {
  return false;
}

type ActionTone = "default" | "success" | "warning" | "destructive";

interface ClassroomActionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: ReactNode;
  label: string;
  pressed?: boolean;
  statusLabel?: string;
  tone?: ActionTone;
  emphasis?: "normal" | "strong";
  onPressedChange?: (pressed: boolean) => void;
}

const pressedToneClasses: Record<ActionTone, string> = {
  default:
    "data-[state=on]:border-primary/40 data-[state=on]:bg-primary/10 data-[state=on]:text-primary",
  success:
    "data-[state=on]:border-success/50 data-[state=on]:bg-success/10 data-[state=on]:text-success",
  warning:
    "data-[state=on]:border-warning/50 data-[state=on]:bg-warning/10 data-[state=on]:text-warning-foreground",
  destructive:
    "data-[state=on]:border-destructive/50 data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive",
};

export const ClassroomActionButton = forwardRef<
  HTMLButtonElement,
  ClassroomActionButtonProps
>(function ClassroomActionButton(
  {
    className,
    disabled,
    icon,
    label,
    pressed,
    statusLabel,
    tone = "default",
    emphasis = "normal",
    onPressedChange,
    title,
    type = "button",
    ...props
  },
  ref,
) {
  const compact = useClassroomPresentation()?.mode === "compact";
  const content = (
    <>
      <span
        className={cn(
          "relative flex items-center justify-center",
          compact ? "size-6" : "size-7",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "line-clamp-2 max-w-full whitespace-normal text-center text-[10px] font-medium leading-tight",
          compact ? "@max-[400px]:sr-only" : "sm:text-xs",
        )}
      >
        {label}
      </span>
      {statusLabel && <span className="sr-only">{statusLabel}</span>}
    </>
  );
  const controlClasses = cn(
    "relative h-16 w-full max-w-20 flex-col gap-0.5 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-foreground shadow-none hover:border-border hover:bg-muted/70 hover:text-foreground sm:max-w-24 sm:px-2 [&_svg]:size-5",
    pressedToneClasses[tone],
    compact &&
      "h-14 min-w-0 max-w-none px-0.5 sm:max-w-none sm:px-0.5 [&_svg]:size-4",
    className,
  );
  const accessibleLabel = statusLabel ? `${label}: ${statusLabel}` : label;

  if (pressed !== undefined) {
    return (
      <Toggle
        ref={ref}
        type={type}
        pressed={pressed}
        disabled={disabled}
        aria-label={accessibleLabel}
        title={title ?? accessibleLabel}
        className={controlClasses}
        onPressedChange={onPressedChange}
        {...props}
      >
        {content}
      </Toggle>
    );
  }

  return (
    <Button
      ref={ref}
      type={type}
      variant="ghost"
      disabled={disabled}
      aria-label={accessibleLabel}
      title={title ?? accessibleLabel}
      className={cn(
        controlClasses,
        tone === "destructive" &&
          emphasis === "normal" &&
          "border-destructive/40 bg-destructive/5 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive",
        tone === "destructive" &&
          emphasis === "strong" &&
          "border-destructive bg-destructive text-white hover:border-destructive hover:bg-destructive/90 hover:!text-destructive-foreground",
      )}
      {...props}
    >
      {content}
    </Button>
  );
});

interface ClassroomActionBarProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  mobile?: ReactNode;
}

export function ClassroomActionBar({
  left,
  center,
  right,
  mobile,
}: ClassroomActionBarProps) {
  const compact = useClassroomPresentation()?.mode === "compact";
  const isCompact = useSyncExternalStore(
    subscribeToControlsLayout,
    getCompactControlsSnapshot,
    getServerControlsSnapshot,
  );

  if (mobile && isCompact && !compact) {
    return (
      <div className="grid min-h-20 w-full grid-cols-4 items-center justify-items-center bg-card px-1 py-1">
        {mobile}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid min-h-20 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center bg-card px-1.5 py-1 sm:px-2",
        compact &&
          "@container !min-h-14 grid-cols-none grid-flow-col auto-cols-fr gap-0.5 [&>div]:contents [&>div>div]:min-w-0",
      )}
    >
      <div className="flex min-w-0 items-center justify-start gap-0.5 border-r border-border/70 pr-1 sm:gap-1 sm:pr-2">
        {left}
      </div>
      <div className="scrollbar-thin flex min-w-0 items-center justify-start gap-0.5 overflow-x-auto px-1 sm:justify-center sm:gap-1 sm:px-2">
        {center}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-0.5 border-l border-border/70 pl-1 sm:gap-1 sm:pl-2">
        {right}
      </div>
    </div>
  );
}
