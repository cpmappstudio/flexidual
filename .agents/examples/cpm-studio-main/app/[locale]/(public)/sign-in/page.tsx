import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { SignInAccessDenied } from "@/components/auth/sign-in-access-denied";
import SignInForm from "@/components/auth/sign-in-form";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import type { LocaleParams } from "@/i18n/params";
import { getCurrentConvexUser } from "@/lib/auth/server";
import { ROUTES } from "@/lib/navigation/routes";
import { getSafeRedirectHref } from "@/lib/navigation/utils";

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("pages.signIn"),
  };
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const [t, { redirectTo }, currentUser] = await Promise.all([
    getTranslations("Common"),
    searchParams,
    getCurrentConvexUser(),
  ]);
  const redirectHref = getSafeRedirectHref(
    typeof redirectTo === "string" ? redirectTo : undefined,
    ROUTES.home,
  );

  if (currentUser) {
    if (currentUser.platformRole) {
      return redirect({ href: redirectHref, locale });
    }

    return (
      <AuthPageShell appName={t("appName")}>
        <IntlMessagesProvider namespaces={["SignIn"]}>
          <SignInAccessDenied signInHref={ROUTES.auth.signIn} />
        </IntlMessagesProvider>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell appName={t("appName")}>
      <IntlMessagesProvider namespaces={["SignIn"]}>
        <SignInForm redirectHref={redirectHref} />
      </IntlMessagesProvider>
    </AuthPageShell>
  );
}
