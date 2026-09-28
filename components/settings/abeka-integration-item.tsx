"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";

export function AbekaLoading() {
  const t = useTranslations("settings.integrations");
  return (
    <div
      role="status"
      className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
    >
      <Spinner aria-hidden="true" />
      {t("loading")}
    </div>
  );
}

type AbekaStatus = Doc<"abekaConnections">["status"];

export function AbekaLogo({ status }: { status?: AbekaStatus }) {
  return (
    <Image
      src="/providers/abeka-logo.svg"
      alt="Abeka"
      width={40}
      height={40}
      className={cn(
        "size-10 shrink-0 object-contain transition-opacity",
        (!status ||
          status === "disconnected" ||
          status === "needs_reconnect") &&
          "grayscale opacity-40",
      )}
    />
  );
}

export function AbekaStatusBadge({
  status,
  running = false,
}: {
  status?: AbekaStatus;
  running?: boolean;
}) {
  const t = useTranslations("settings.integrations");
  if (!status || status === "disconnected")
    return <span className="sr-only">{t("status.disconnected")}</span>;
  return (
    <Badge variant="secondary" aria-live="polite">
      {running && <Spinner aria-hidden="true" />}
      {running ? t("running") : t(`status.${status}`)}
    </Badge>
  );
}

export function AbekaIntegrationItem({
  status,
  running = false,
  action,
}: {
  status?: Doc<"abekaConnections">["status"];
  running?: boolean;
  action: ReactNode;
}) {
  const t = useTranslations("settings.integrations");
  return (
    <Item variant="outline">
      <ItemMedia>
        <AbekaLogo status={status} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          Abeka
          <AbekaStatusBadge status={status} running={running} />
        </ItemTitle>
        <ItemDescription>{t("description")}</ItemDescription>
      </ItemContent>
      <ItemActions>{action}</ItemActions>
    </Item>
  );
}
