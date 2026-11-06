"use client";

import { useFormatter } from "next-intl";
import { Progress } from "@/components/ui/progress";

export function ProgressPercentage({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const format = useFormatter();
  const percentage = format.number(value / 100, {
    style: "percent",
    maximumFractionDigits: 2,
  });
  return (
    <div className="flex min-w-36 items-center gap-1.5 sm:min-w-52">
      <Progress
        value={value}
        aria-label={label}
        aria-valuetext={percentage}
        className="h-2 flex-1 bg-muted"
        indicatorClassName={`motion-reduce:transition-none ${
          value >= 100
            ? "bg-green-600"
            : value >= 50
              ? "bg-primary"
              : "bg-amber-500"
        }`}
      />
      <span className="w-12 shrink-0 text-xs font-medium tabular-nums">
        {percentage}
      </span>
    </div>
  );
}
