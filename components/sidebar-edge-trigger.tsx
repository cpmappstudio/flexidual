"use client";

import Image from "next/image";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SidebarEdgeTriggerProps = ComponentProps<"button"> & {
  direction: "expand" | "collapse";
};

export function SidebarEdgeTrigger({
  direction,
  className,
  ...props
}: SidebarEdgeTriggerProps) {
  return (
    <button
      type="button"
      className={cn(
        "group/edge-trigger flex h-11 w-[14px] items-center justify-start border-0 bg-transparent p-0 focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      <span className="flex h-7 w-[14px] items-center justify-center rounded-r-md border border-l-0 border-primary bg-primary shadow-sm transition-colors group-hover/edge-trigger:bg-primary/90 group-focus-visible/edge-trigger:ring-2 group-focus-visible/edge-trigger:ring-sidebar-ring">
        <Image
          src={`/sidebar-${direction}.svg`}
          alt=""
          width={24}
          height={24}
          aria-hidden="true"
          className="size-3 shrink-0"
        />
      </span>
    </button>
  );
}
