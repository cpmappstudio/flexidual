"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

export function EventOverlapNotice({ count }: { count: number }) {
  const t = useTranslations("events");

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg bg-warning/10 px-4 py-3"
    >
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-warning"
      />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {t("overlapTitle", { count })}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("overlapDescription")}
        </p>
      </div>
    </div>
  );
}
