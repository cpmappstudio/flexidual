import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/navigation/routes";

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function TenantRootPage({ params }: PageProps) {
  const { tenant } = await params;
  redirect(ROUTES.org.applications.list(tenant));
}
