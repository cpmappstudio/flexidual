import type { Metadata } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { requireLocale } from "@/i18n/locale";
import type { RequestedLocaleParams } from "@/i18n/params";
import { routing } from "@/i18n/routing";
import "@/app/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Comment by @ulvenforst:
// Next.js calls this by convention for the dynamic `[locale]` segment.
// It may look unused, but it tells Next which locale routes can be prepared
// at build time and enables next-intl static rendering with setRequestLocale.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: RequestedLocaleParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: {
      default: t("title"),
      template: `${t("title")} | %s`,
    },
    description: t("description"),
    icons: {
      icon: "/convex.svg",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: RequestedLocaleParams;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <ConvexAuthNextjsServerProvider>
      <html lang={locale} suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ConvexClientProvider>
              <TooltipProvider>
                <NextIntlClientProvider messages={messages}>
                  {children}
                </NextIntlClientProvider>
              </TooltipProvider>
              <Toaster position="bottom-right" />
            </ConvexClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
