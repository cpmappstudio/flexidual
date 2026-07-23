import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireLocale } from "@/i18n/locale";
import type { TenantCampusParams } from "@/i18n/params";
import { getTenantCampusBySlug } from "@/lib/campuses/server";
import { ROUTES } from "@/lib/navigation/routes";
import { getTenantCanonicalHref } from "@/lib/tenancy/domain";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";

export async function generateMetadata({
  params,
}: {
  params: TenantCampusParams;
}): Promise<Metadata> {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  const [workspace, campusRecord] = await Promise.all([
    getCurrentTenantWorkspace(tenant),
    getTenantCampusBySlug(tenant, campus),
  ]);

  if (!workspace || !campusRecord) {
    const t = await getTranslations({ locale, namespace: "Metadata" });

    return {
      title: t("pages.campuses"),
    };
  }

  return {
    title: {
      absolute: `${campusRecord.name} | ${workspace.organization.name}`,
    },
  };
}

export default async function TenantCampusDetailPage({
  params,
}: {
  params: TenantCampusParams;
}) {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const campusRecord = await getTenantCampusBySlug(tenant, campus);

  if (!campusRecord) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "TenantHome" });
  const campusesHref = getTenantCanonicalHref(
    ROUTES.tenant.root(tenant),
    tenant,
  );

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href={campusesHref}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("backToCampuses")}
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {campusRecord.name}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("detailPlaceholder")}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-dashed border-border/70 bg-background px-4 py-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t("campusSlugLabel")}
            </p>
            <p className="mt-2 text-sm font-medium">{campusRecord.slug}</p>
          </div>
          <div className="rounded-2xl border border-dashed border-border/70 bg-background px-4 py-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t("tenantLabel")}
            </p>
            <p className="mt-2 text-sm font-medium">{tenant}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
