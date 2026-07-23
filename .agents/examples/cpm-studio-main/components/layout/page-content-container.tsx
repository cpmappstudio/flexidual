import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const PAGE_CONTENT_CONTAINER_CLASS_NAME =
  "mx-auto w-full max-w-7xl px-4 py-10";

export function PageContentContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(PAGE_CONTENT_CONTAINER_CLASS_NAME, className)}>
      {children}
    </div>
  );
}
