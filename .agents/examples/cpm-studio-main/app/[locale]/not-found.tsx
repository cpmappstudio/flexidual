import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RouteStatusPage } from "@/components/route-status-page";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/navigation/routes";

export default async function LocaleNotFound() {
  const t = await getTranslations("Common");

  return (
    <RouteStatusPage
      title={t("routeStatus.notFound.title")}
      description={t("routeStatus.notFound.description")}
    >
      <Button asChild>
        <Link href={ROUTES.home}>{t("routeStatus.actions.goHome")}</Link>
      </Button>
    </RouteStatusPage>
  );
}
