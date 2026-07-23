import type { Metadata } from "next";
import type { LocaleParams } from "@/i18n/params";
import {
  generateChangelogMetadata,
  renderGlobalChangelogPage,
} from "@/lib/changelog/page.server";

export function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  return generateChangelogMetadata({ params });
}

export default function GlobalChangelogPage({
  params,
}: {
  params: LocaleParams;
}) {
  return renderGlobalChangelogPage({ params });
}
