"use client";

import { useTranslations } from "next-intl";
import {
  ResourceCollectionGrid,
  ResourceCollectionSection,
} from "@/components/resources/resource-collection";
import { TenantCampusTile } from "@/components/tenant/tenant-campus-tile";
import { TenantCreateCampusDialog } from "@/components/tenant/tenant-create-campus-dialog";
import type { Id } from "@/convex/_generated/dataModel";

type TenantCampusCard = {
  _id: Id<"campuses">;
  slug: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  href: string;
};

export function TenantCampusGrid({
  canManage,
  tenantSlug,
  campuses,
}: {
  canManage: boolean;
  tenantSlug: string;
  campuses: TenantCampusCard[];
}) {
  const t = useTranslations("TenantHome");

  return (
    <ResourceCollectionSection title={t("title")}>
      <ResourceCollectionGrid>
        {canManage ? (
          <li className="h-full">
            <TenantCreateCampusDialog tenantSlug={tenantSlug} />
          </li>
        ) : null}
        {campuses.map((campus) => (
          <li key={campus.slug}>
            <TenantCampusTile
              canManage={canManage}
              campus={campus}
              tenantSlug={tenantSlug}
            />
          </li>
        ))}
      </ResourceCollectionGrid>
    </ResourceCollectionSection>
  );
}
