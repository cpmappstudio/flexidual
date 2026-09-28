"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { Button } from "@/components/ui/button";
import { AbekaIntegrationItem, AbekaLoading } from "./abeka-integration-item";

export function IntegrationSettings() {
  const t = useTranslations("settings.integrations");
  const { context, isLoading, basePath } = useSettingsContext();
  if (isLoading) return <AbekaLoading />;
  if (!context?.canManageInstitution) return null;
  return (
    <section className="grid gap-3" aria-labelledby="integrations-title">
      <h2
        id="integrations-title"
        className="border-b pb-3 text-xl font-semibold"
      >
        {t("title")}
      </h2>
      <AbekaSummary
        schoolId={context.institution._id}
        href={`${basePath}/integrations/abeka`}
      />
    </section>
  );
}

function AbekaSummary({
  schoolId,
  href,
}: {
  schoolId: Id<"schools">;
  href: string;
}) {
  const t = useTranslations("settings.integrations");
  const state = useQuery(api.abeka.status, { schoolId });
  if (!state) return <AbekaLoading />;
  return (
    <AbekaIntegrationItem
      status={state.connection?.status}
      running={state.run?.status === "running"}
      action={
        <Button
          asChild
          size="icon-sm"
          variant="outline"
          className="rounded-full"
        >
          <Link
            href={href}
            aria-label={t("detail.open")}
            title={t("detail.open")}
          >
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    />
  );
}
