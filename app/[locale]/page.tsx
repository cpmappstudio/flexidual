import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LandingPage } from "@/components/marketing/landing-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function HomePage() {
  return <LandingPage />;
}
