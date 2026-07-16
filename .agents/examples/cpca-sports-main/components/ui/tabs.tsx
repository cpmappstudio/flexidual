"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";
import { LayoutGroup, motion } from "motion/react";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-0", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const groupId = React.useId();
  return (
    <LayoutGroup id={groupId}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(
          "relative z-10 mb-6 flex min-h-9 w-full border-b border-border/70 pb-2.5",
          className,
        )}
        {...props}
      />
    </LayoutGroup>
  );
}

type TabsTriggerButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  "data-state"?: "active" | "inactive";
};

const TabsTriggerButton = React.forwardRef<
  HTMLButtonElement,
  TabsTriggerButtonProps
>(({ className, children, "data-state": dataState, ...rest }, ref) => {
  const isActive = dataState === "active";

  return (
    <button {...rest} ref={ref} className={cn("relative", className)}>
      {children}
      {isActive && (
        <motion.span
          layoutId="current-indicator"
          className="pointer-events-none absolute inset-x-2 -bottom-2.5 h-0.5 rounded-full bg-sidebar-accent"
        />
      )}
    </button>
  );
});
TabsTriggerButton.displayName = "TabsTriggerButton";

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof TabsPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.Trigger {...props} ref={ref} data-slot="tabs-trigger" asChild>
    <TabsTriggerButton
      className={cn(
        'relative mr-3 inline-flex h-[calc(100%-1px)] shrink-0 items-center justify-center gap-1.5 rounded-lg p-2 text-base/6 font-medium whitespace-nowrap text-zinc-950 transition-[color,box-shadow] cursor-pointer hover:bg-zinc-950/5 dark:text-white dark:data-[state=active]:border-input dark:hover:bg-white/5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        className,
      )}
    >
      {children}
    </TabsTriggerButton>
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = "TabsTrigger";

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
