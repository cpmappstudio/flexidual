import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { requireLocale } from "@/i18n/locale";
import type { LocaleParams } from "@/i18n/params";

export default async function AuthenticatedAppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: LocaleParams;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  return (
    <div className="min-h-screen bg-muted [--header-height:calc(--spacing(14))]">
      {children}
    </div>
  );
}
