import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ResourceCollectionSectionProps = {
  title: string;
  titleAs?: "h1" | "h2";
  children: ReactNode;
  className?: string;
};

export function ResourceCollectionSection({
  title,
  titleAs: Title = "h1",
  children,
  className,
}: ResourceCollectionSectionProps) {
  return (
    <section className={cn("flex flex-col gap-8", className)}>
      <Title className="text-2xl font-semibold tracking-tight">{title}</Title>
      {children}
    </section>
  );
}

export function ResourceCollectionGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function ResourceCreateTileButton({
  label,
  className,
  ...props
}: {
  label: string;
} & Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-full min-h-48 w-full cursor-pointer flex-col gap-3 rounded-3xl border-dashed border-border/70 bg-card px-6 py-8 text-muted-foreground shadow-none hover:bg-card hover:text-foreground",
        className,
      )}
      {...props}
    >
      <span className="text-2xl leading-none">+</span>
      <span className="text-sm font-medium">{label}</span>
    </Button>
  );
}
