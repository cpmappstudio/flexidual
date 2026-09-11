"use client";

import { cn } from "@/lib/utils";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

interface ClassroomLayoutProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  isSidebarOpen?: boolean;
  layoutMode?: "responsive" | "recording";
}

export const ClassroomLayout = forwardRef<HTMLDivElement, ClassroomLayoutProps>(
  function ClassroomLayout(
    {
      children,
      className,
      isSidebarOpen = true,
      layoutMode = "responsive",
      ...props
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          "relative grid h-full min-h-0 w-full overflow-hidden bg-card font-sans text-foreground",
          layoutMode === "recording"
            ? "grid-cols-[minmax(0,1fr)_256px] grid-rows-[3.5rem_minmax(0,1fr)] [--classroom-header-height:3.5rem]"
            : cn(
                "grid-cols-1 grid-rows-[min-content_minmax(0,1fr)_min-content_min-content] xl:grid-rows-[min-content_minmax(0,1fr)_min-content] xl:transition-[grid-template-columns] xl:duration-200 xl:[--classroom-header-height:3.5rem] motion-reduce:transition-none",
                isSidebarOpen
                  ? "xl:grid-cols-[minmax(0,1fr)_256px]"
                  : "xl:grid-cols-[minmax(0,1fr)_0px]",
              ),
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

interface ClassroomRegionProps extends ComponentPropsWithoutRef<"div"> {
  isPhoneLandscape?: boolean;
  layoutMode?: "responsive" | "recording";
}

export function ClassroomLayoutHeader({
  children,
  className,
  isPhoneLandscape = false,
  layoutMode = "responsive",
  ...props
}: ClassroomRegionProps) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-1 z-10 flex min-w-0 flex-col justify-center border-b-2 border-primary bg-card",
        !isPhoneLandscape && "px-2 py-1.5 md:px-2.5",
        layoutMode === "recording" && "h-[var(--classroom-header-height)]",
        layoutMode === "responsive" && "xl:h-[var(--classroom-header-height)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ClassroomLayoutStage({
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

export function ClassroomLayoutControls({
  children,
  className,
  isPhoneLandscape = false,
  ...props
}: ClassroomRegionProps) {
  if (isPhoneLandscape) return null;

  return (
    <div
      className={cn(
        "col-start-1 row-start-4 z-10 overflow-hidden border-t border-border bg-card xl:col-start-1 xl:row-start-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ClassroomLayoutSidebar({
  children,
  className,
  layoutMode = "responsive",
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  layoutMode?: "responsive" | "recording";
}) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-3 z-0 flex h-14 min-h-0 min-w-0 flex-col overflow-hidden border-t border-border bg-card",
        layoutMode === "recording"
          ? "col-start-2 row-start-1 row-span-2 h-full border-l border-t-0"
          : "xl:col-start-2 xl:row-start-1 xl:row-span-3 xl:h-full xl:border-l xl:border-t-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
