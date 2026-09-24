"use client";

import { useTranslations } from "next-intl";

export function SessionClosureProgress({
  closing,
  retrying,
}: {
  closing?: boolean;
  retrying?: boolean;
}) {
  const t = useTranslations("classroom");
  if (!closing) return null;
  return (
    <p role="status" className="mt-2 text-sm text-muted-foreground">
      {t(retrying ? "closureRetrying" : "closureInProgress")}
    </p>
  );
}
