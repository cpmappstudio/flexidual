"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RouteStatusPage } from "@/components/route-status-page";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/navigation/routes";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <RouteStatusPage
      title={t("routeStatus.error.title")}
      description={t("routeStatus.error.description")}
    >
      <Button variant="outline" onClick={() => reset()}>
        {t("routeStatus.actions.tryAgain")}
      </Button>
      <Button asChild>
        <Link href={ROUTES.home}>{t("routeStatus.actions.goHome")}</Link>
      </Button>
    </RouteStatusPage>
  );
}
