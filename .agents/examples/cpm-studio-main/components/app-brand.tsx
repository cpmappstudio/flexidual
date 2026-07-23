import { Building03Icon as Building03HugeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

export function AppBrand({
  appName,
  labelMode = "expanded",
}: {
  appName: string;
  labelMode?: "expanded" | "collapsed";
}) {
  const shouldCollapseBrandLabel = labelMode === "collapsed";

  return (
    <>
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <HugeiconsIcon
          icon={Building03HugeIcon}
          strokeWidth={2}
          className="size-4"
          aria-hidden="true"
        />
      </div>
      <span
        className={cn(
          "grid min-w-0 overflow-hidden whitespace-nowrap text-foreground",
          shouldCollapseBrandLabel
            ? "grid-cols-[0fr] pl-0 opacity-0"
            : "grid-cols-[1fr] pl-3 opacity-100",
        )}
      >
        <span className="min-w-0 font-medium">{appName}</span>
      </span>
    </>
  );
}
