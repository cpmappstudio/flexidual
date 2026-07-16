import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { notFound, redirect } from "next/navigation";
import { ProgramCreateWorkspace } from "@/components/sections/shell/programs/create/program-create-workspace";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { getAuthToken } from "@/lib/auth/auth";
import { getTenantAccess } from "@/lib/auth/tenant-access";
import { ROUTES } from "@/lib/navigation/routes";

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ programId?: string }>;
}

export default async function CreateProgramPage({
  params,
  searchParams,
}: PageProps) {
  const { tenant } = await params;
  const { programId } = await searchParams;
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

  if (!programId) {
    redirect(ROUTES.org.programs.list(tenant));
  }

  let initialProgram: Doc<"programs"> | null = null;
  const preloadedTemplates = await preloadQuery(
    api.formTemplates.listByOrganization,
    { organizationId: organization._id },
    { token },
  );

  try {
    const preloadedProgram = await preloadQuery(
      api.programs.getById,
      { programId: programId as Id<"programs"> },
      { token },
    );

    initialProgram = preloadedQueryResult(preloadedProgram);
  } catch {
    notFound();
  }

  if (!initialProgram || initialProgram.organizationId !== organization._id) {
    notFound();
  }

  return (
    <ProgramCreateWorkspace
      initialProgram={initialProgram}
      templates={preloadedQueryResult(preloadedTemplates)}
    />
  );
}
