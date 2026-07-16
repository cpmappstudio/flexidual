import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import CpcaHeader from "@/components/common/cpca-header";
import { ProgramCreateDialog } from "@/components/sections/shell/programs/program-create-dialog";
import { ProgramsTable } from "@/components/sections/shell/programs/programs-table";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { getAuthToken } from "@/lib/auth/auth";
import { getTenantAccess } from "@/lib/auth/tenant-access";
import { ROUTES } from "@/lib/navigation/routes";

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ProgramsPage({ params }: PageProps) {
  const { tenant } = await params;
  const token = await getAuthToken();

  const [{ isAdmin }, tPage, preloadedOrganization] = await Promise.all([
    getTenantAccess(tenant, token),
    getTranslations("Programs.page"),
    preloadQuery(api.organizations.getBySlug, { slug: tenant }, { token }),
  ]);

  if (!isAdmin) {
    redirect(ROUTES.org.applications.list(tenant));
  }

  const organization = preloadedQueryResult(preloadedOrganization);

  if (!organization) {
    notFound();
  }

  const [preloadedPrograms, preloadedTemplates] = await Promise.all([
    preloadQuery(
      api.programs.listByOrganization,
      { organizationId: organization._id },
      { token },
    ),
    preloadQuery(
      api.formTemplates.listByOrganization,
      { organizationId: organization._id },
      { token },
    ),
  ]);

  const programs = preloadedQueryResult(preloadedPrograms);
  const templates = preloadedQueryResult(preloadedTemplates);

  return (
    <>
      <CpcaHeader
        title={tPage("title")}
        subtitle={tPage("description")}
        logoUrl={organization?.imageUrl}
        action={
          <ProgramCreateDialog
            organizationId={organization._id}
            organizationSlug={tenant}
          >
            <Button>{tPage("createAction")}</Button>
          </ProgramCreateDialog>
        }
      />
      <ProgramsTable
        organizationId={organization._id}
        organizationSlug={tenant}
        programs={programs}
        templates={templates}
      />
    </>
  );
}
