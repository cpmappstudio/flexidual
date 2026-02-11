import ConvexClientProvider from "@/components/convex-client-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider"
import { shadcn } from "@clerk/themes"
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { enUS, esES } from '@clerk/localizations';
import { AlertProvider } from "@/components/providers/alert-provider";

export default async function LocaleLayout({
    children,
    params,
}: Readonly<{
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}>) {
    const { locale } = await params;

    // Solo validar y configurar en el layout raíz
    // El middleware ya hace validación, pero esto es backup por si acaso
    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    // Enable static rendering - Solo necesario aquí
    setRequestLocale(locale);

    // Obtener mensajes para el locale
    const messages = await getMessages();

    // Configurar localización de Clerk según el idioma
    const clerkLocalization = locale === 'es' ? esES : enUS;

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
        >
            <ClerkProvider
                appearance={{
                    baseTheme: shadcn,
                }}
                localization={clerkLocalization}
                afterSignOutUrl={`/${locale}/sign-in`}
            >
                <ConvexClientProvider>
                    <NextIntlClientProvider messages={messages}>
                        <AlertProvider>
                            {children}
                        </AlertProvider>
                    </NextIntlClientProvider>
                </ConvexClientProvider>
            </ClerkProvider>
        </ThemeProvider>
    );
}

// Generar parámetros estáticos para build usando routing
export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}
