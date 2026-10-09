import { cn } from "@/lib/utils";

export function carouselCardStyles(variant: "default" | "accent") {
  return cn(
    "rounded-2xl border bg-sidebar text-foreground transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    variant === "accent"
      ? "border-secondary/60 shadow-[inset_3px_0_0_var(--secondary)] hover:bg-muted/40"
      : "border-border hover:bg-muted",
  );
}
