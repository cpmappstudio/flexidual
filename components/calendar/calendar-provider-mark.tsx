import Image from "next/image";
import { cn } from "@/lib/utils";

type CalendarProviderMarkProps = {
  sessionType: "live" | "ignitia" | "abeka";
  isPast?: boolean;
  className?: string;
};

export function CalendarProviderMark({
  sessionType,
  isPast = false,
  className,
}: CalendarProviderMarkProps) {
  if (sessionType === "live") return null;

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
          sessionType === "ignitia"
            ? "/providers/ignitia-logo.png"
            : "/providers/abeka-logo.svg"
        }
        alt=""
        fill
        sizes="16px"
        className="pointer-events-none select-none object-contain"
      />
    </span>
  );
}
