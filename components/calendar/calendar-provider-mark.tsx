import Image from "next/image";
import type { ClassSessionType } from "@/lib/class-session";
import { cn } from "@/lib/utils";

type CalendarProviderMarkProps = {
  sessionType: ClassSessionType;
  isPast?: boolean;
  className?: string;
  sizes?: string;
};

export function CalendarProviderMark({
  sessionType,
  isPast = false,
  className,
  sizes = "16px",
}: CalendarProviderMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-4 shrink-0",
        isPast && "opacity-60 saturate-50",
        className,
      )}
    >
      <Image
        src={
          sessionType === "live"
            ? "/professors-icon.svg"
            : sessionType === "ignitia"
              ? "/providers/ignitia-logo.png"
              : "/providers/abeka-logo.svg"
        }
        alt=""
        fill
        sizes={sizes}
        className="pointer-events-none select-none object-contain"
      />
    </span>
  );
}
