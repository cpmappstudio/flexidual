import { clerkClient } from "@clerk/nextjs/server";
import { OrganizationList } from "@/components/sections/shell/admin/organizations";

import { adminOrganizationsMetadata } from "@/lib/seo/admin";
import { Metadata } from "next";
export const metadata: Metadata = adminOrganizationsMetadata;

export default async function OrganizationsPage() {
  const { data: organizations } = await (
    await clerkClient()
  ).organizations.getOrganizationList({ orderBy: "-created_at" });

  return <OrganizationList organizations={organizations} />;
}
