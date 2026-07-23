import type { Metadata } from "next";
import type { TenantParams } from "@/i18n/params";
import {
  generateChangelogMetadata,
  renderTenantChangelogPage,
} from "@/lib/changelog/page.server";

export function generateMetadata({
  params,
}: {
  params: TenantParams;
}): Promise<Metadata> {
  return generateChangelogMetadata({ params });
}

export default function TenantChangelogPage({
  params,
}: {
  params: TenantParams;
}) {
  return renderTenantChangelogPage({ params });
}
