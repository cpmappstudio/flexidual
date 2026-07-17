import { getTranslations } from "next-intl/server";
import { Building2 } from "lucide-react";
import { OrganizationCard } from "./card";
import { CreateOrganizationCard } from "./create-card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { Organization } from "@clerk/nextjs/server";

interface OrganizationListProps {
  organizations: Organization[];
}

export async function OrganizationList({
  organizations,
}: OrganizationListProps) {
  const t = await getTranslations("Admin.organizations");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {organizations.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>{t("empty")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateOrganizationCard />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-4 items-stretch">
          <CreateOrganizationCard />
          {organizations.map((org) => (
            <OrganizationCard
              key={org.id}
              id={org.id}
              name={org.name}
              slug={org.slug || org.id}
              imageUrl={org.imageUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
