import type { ComponentProps } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageCreateButton({
  label,
  className,
  "aria-label": ariaLabel,
  ...props
}: Omit<
  ComponentProps<typeof Button>,
  "asChild" | "children" | "size" | "variant"
> & {
  label: string;
}) {
  return (
    <Button
      aria-label={ariaLabel ?? label}
      className={cn("gap-2", className)}
      {...props}
    >
      <Plus />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

export function ResponsivePageAction({
  className,
  mobileVariant = "icon",
  ...props
}: ComponentProps<"div"> & {
  mobileVariant?: "icon" | "label";
}) {
  return (
    <div
      className={cn(
        "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 drop-shadow-md md:static md:drop-shadow-none",
        mobileVariant === "icon"
          ? "max-md:[&_[data-slot=button]]:size-12 max-md:[&_[data-slot=button]]:rounded-full max-md:[&_[data-slot=button]]:p-0 max-md:[&_[data-slot=button]_svg]:size-5"
          : "max-md:[&_[data-slot=button]]:h-12 max-md:[&_[data-slot=button]]:rounded-full max-md:[&_[data-slot=button]]:px-5 max-md:[&_[data-slot=button]]:text-base",
        className,
      )}
      {...props}
    />
  );
}
