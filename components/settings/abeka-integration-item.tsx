"use client";

import type { ReactNode, ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
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

export function isAbekaDisconnected(status?: AbekaStatus) {
  return !status || status === "disconnected";
}

export function AbekaIconAction({
  label,
  tooltip,
  icon: Icon,
  loading = false,
  ...buttonProps
}: {
  label: string;
  tooltip?: string;
  icon: LucideIcon;
  loading?: boolean;
} & ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={label}
            aria-busy={loading}
            {...buttonProps}
          >
            {loading ? (
              <Spinner aria-hidden="true" />
            ) : (
              <Icon aria-hidden="true" />
            )}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {tooltip ?? label}
      </TooltipContent>
    </Tooltip>
  );
}

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
