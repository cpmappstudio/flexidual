"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AvatarBadge } from "@/components/ui/avatar";

export type UserPresenceStatus = {
  online: boolean;
  lastDisconnected: number;
} | null;

export function UserPresenceDot({ status }: { status?: UserPresenceStatus }) {
  const t = useTranslations("presence");
  return status?.online ? (
    <AvatarBadge className="size-3 bg-success" aria-label={t("online")} />
  ) : null;
}

export function UserPresenceText({ status }: { status?: UserPresenceStatus }) {
  const t = useTranslations("presence");
  const format = useFormatter();
  const [timeZone, setTimeZone] = useState<string>();
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  if (status === undefined) return null;
  if (status?.online)
    return <span className="text-success">{t("online")}</span>;
  if (!status?.lastDisconnected) return <span>{t("unknown")}</span>;
  if (!timeZone) return null;
  return (
    <span>
      {t("lastSeen", {
        date: format.dateTime(status.lastDisconnected, {
          dateStyle: "short",
          timeStyle: "short",
          timeZone,
        }),
      })}
    </span>
  );
}
