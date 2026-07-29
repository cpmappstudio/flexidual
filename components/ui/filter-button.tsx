import type { ComponentProps } from "react";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FilterButton({
  active,
  label,
  className,
  ...props
}: {
  active: boolean;
  label: string;
} & Omit<ComponentProps<typeof Button>, "children" | "size" | "variant">) {
  return (
    <Button
      {...props}
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "relative cursor-pointer bg-sidebar hover:bg-accent",
        active && "border-2 border-primary",
        className,
      )}
      aria-label={label}
    >
      <ListFilter className="size-3.5" />
    </Button>
  );
}
