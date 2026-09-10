import { cn } from "@/lib/utils";

export function UnreadIndicator({
  count,
  label,
  dot = false,
  className,
}: {
  count: number;
  label: string;
  dot?: boolean;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-destructive text-white",
        dot
          ? "size-2 ring-2 ring-background"
          : "min-w-4 px-1 text-[10px] leading-4 font-semibold",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      {!dot && <span aria-hidden="true">{count >= 100 ? "99+" : count}</span>}
    </span>
  );
}
