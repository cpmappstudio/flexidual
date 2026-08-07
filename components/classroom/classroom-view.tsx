"use client";

import { RoomAudioRenderer } from "@livekit/components-react";
import { cn } from "@/lib/utils";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

interface ClassroomViewProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
}

export const ClassroomView = forwardRef<HTMLDivElement, ClassroomViewProps>(
  function ClassroomView({ children, className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "relative grid h-full min-h-0 w-full grid-cols-1 grid-rows-[min-content_minmax(0,1fr)_min-content_min-content] overflow-hidden bg-card font-sans text-foreground",
          "landscape:grid-cols-[minmax(0,1fr)_232px] landscape:grid-rows-[min-content_minmax(0,1fr)_min-content]",
          "xl:grid-cols-[minmax(0,1fr)_256px] xl:grid-rows-[min-content_minmax(0,1fr)_min-content]",
          className,
        )}
        {...props}
      >
        <RoomAudioRenderer />
        {children}
      </div>
    );
  },
);

interface ClassroomRegionProps extends ComponentPropsWithoutRef<"div"> {
  isPhoneLandscape?: boolean;
}

export function ClassroomViewHeader({
  children,
  className,
  isPhoneLandscape = false,
  ...props
}: ClassroomRegionProps) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-1 z-10 flex min-w-0 flex-col justify-center border-b border-primary/20 bg-gradient-to-br from-primary/15 via-background to-secondary/15 landscape:col-span-2 xl:col-span-2",
        !isPhoneLandscape && "px-2 py-1.5 md:px-2.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ClassroomViewStage({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "relative col-start-1 row-start-2 z-10 flex min-h-0 min-w-0 flex-col bg-background",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ClassroomViewControls({
  children,
  className,
  isPhoneLandscape = false,
  ...props
}: ClassroomRegionProps) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-4 z-10 overflow-hidden border-t border-border bg-card landscape:col-start-1 landscape:row-start-3 xl:col-start-1 xl:row-start-3",
        isPhoneLandscape ? "hidden" : "",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ClassroomViewSidebar({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-3 z-0 flex h-32 min-h-0 min-w-0 flex-col overflow-hidden border-t border-border bg-card",
        "landscape:col-start-2 landscape:row-start-2 landscape:row-span-2 landscape:h-full landscape:border-l landscape:border-t-0",
        "xl:col-start-2 xl:row-start-2 xl:row-span-2 xl:h-full xl:border-l xl:border-t-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
