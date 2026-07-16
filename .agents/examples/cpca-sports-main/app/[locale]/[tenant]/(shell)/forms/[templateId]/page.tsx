import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { notFound, redirect } from "next/navigation";
import { FormTemplateEditor } from "@/components/sections/shell/forms/form-template-editor";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthToken } from "@/lib/auth/auth";
import { getTenantAccess } from "@/lib/auth/tenant-access";
import { ROUTES } from "@/lib/navigation/routes";

interface PageProps {
  params: Promise<{ tenant: string; templateId: string }>;
}

export default async function FormTemplateDetailPage({ params }: PageProps) {
  const { tenant, templateId } = await params;
  const token = await getAuthToken();

  const [{ isAdmin }, preloadedOrganization] = await Promise.all([
    getTenantAccess(tenant, token),
    preloadQuery(api.organizations.getBySlug, { slug: tenant }, { token }),
  ]);

  if (!isAdmin) {
    redirect(ROUTES.org.applications.list(tenant));
  }

  const organization = preloadedQueryResult(preloadedOrganization);

  if (!organization) {
    notFound();
  }

  const preloadedTemplate = await preloadQuery(
    api.formTemplates.getById,
    { templateId: templateId as Id<"formTemplates"> },
    { token },
  );
  const template = preloadedQueryResult(preloadedTemplate);

  if (!template || template.organizationId !== organization._id) {
    notFound();
  }

  return (
    <FormTemplateEditor
      organizationSlug={tenant}
      organizationLogoUrl={organization.imageUrl}
      template={template}
    />
  );
}
