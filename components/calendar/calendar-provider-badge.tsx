import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { CalendarProviderMark } from "./calendar-provider-mark";
import { getCalendarProviderAppearanceClasses } from "./calendar-tailwind-classes";

type CalendarProviderBadgeProps = {
  sessionType: "live" | "ignitia" | "abeka";
  isPast?: boolean;
  className?: string;
  markClassName?: string;
  labelClassName?: string;
};

export function CalendarProviderBadge({
  sessionType,
  isPast = false,
  className,
  markClassName,
  labelClassName,
}: CalendarProviderBadgeProps) {
  const t = useTranslations();
  const providerAppearance = getCalendarProviderAppearanceClasses(sessionType);
  const label =
    sessionType === "live"
      ? t("class.typeStandardShort")
      : sessionType === "ignitia"
        ? t("schedule.typeIgnitia")
        : t("schedule.typeAbeka");

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 gap-1 px-2 text-[11px] font-semibold",
        providerAppearance?.badge ??
          "border-primary/40 bg-primary/10 text-primary",
        isPast && "opacity-60 saturate-50",
        className,
      )}
    >
      <CalendarProviderMark
        sessionType={sessionType}
        className={cn("size-3", markClassName)}
      />
      <span className={labelClassName}>{label}</span>
    </Badge>
  );
}
