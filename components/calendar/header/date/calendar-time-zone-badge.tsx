import { Clock3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useCalendarContext } from "../../calendar-context";

export default function CalendarTimeZoneBadge() {
  const { displayTimeZone, isUsingLocalTime } = useCalendarContext();
  const t = useTranslations("calendar");

  if (!isUsingLocalTime) return null;

  return (
    <Badge
      variant="outline"
      className="gap-1 bg-sidebar text-[10px] font-medium text-muted-foreground sm:text-xs"
      title={`${t("localTime")}: ${displayTimeZone}`}
    >
      <Clock3 className="size-3" />
      {t("localTime")}
    </Badge>
  );
}
