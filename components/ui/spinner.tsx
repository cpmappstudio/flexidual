import type { ComponentProps } from "react";
import { LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: ComponentProps<"svg">) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Loading"
      className={cn("size-4 shrink-0 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
