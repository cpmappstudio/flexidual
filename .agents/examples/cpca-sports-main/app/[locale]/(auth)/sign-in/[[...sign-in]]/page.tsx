// ################################################################################
// # Check: 12/13/2025                                                            #
// ################################################################################

import { ROUTES } from "@/lib/navigation/routes";
import { routing } from "@/i18n/routing";
import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { DEFAULT_TENANT_SLUG, isSingleTenantMode } from "@/lib/tenancy/config";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function SignInPage({ params }: PageProps) {
  const { locale } = await params;
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const singleTenantMode = isSingleTenantMode();
  if (singleTenantMode) {
    redirect(`${localePrefix}/${DEFAULT_TENANT_SLUG}/sign-in`);
  }
  const forceRedirectPath = singleTenantMode
    ? ROUTES.org.applications.list(DEFAULT_TENANT_SLUG)
    : ROUTES.auth.organizations;

  return (
    <SignIn
      signUpUrl={`${localePrefix}${ROUTES.auth.signUp}`}
      forceRedirectUrl={`${localePrefix}${forceRedirectPath}`}
      appearance={{
        elements: {
          rootBox: {
            width: "100%",
          },
          card: {
            backgroundColor: "oklch(1 0 0)",
            "&::before": {
              content: '""',
              display: "block",
              width: "150px",
              height: "150px",
              backgroundImage: "url(/cpca-logo.png)",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              margin: "0 auto 1.5rem",
              borderRadius: "0.5rem",
            },
          },
          header: {
            display: "block !important",
          },
          headerTitle: {
            marginTop: "0.5rem",
          },
          headerSubtitle: {
            color: "oklch(0.5 0.01 270)",
          },
          formButtonPrimary: {
            backgroundColor: "oklch(0.4025 0.1539 258.7191)",
            boxShadow: "none !important",
            "&:hover": {
              backgroundColor: "oklch(0.4025 0.1539 258.7191 / 0.8)",
              boxShadow: "none !important",
            },
            "&:focus": {
              boxShadow: "none !important",
            },
            "&:active": {
              boxShadow: "none !important",
            },
            "& .cl-buttonArrowIcon": {
              display: "none",
            },
          },
          "cl-internal-5loyu9": {
            boxShadow: "none !important",
          },
          footer: {
            display: "block !important",
            "& .cl-internal-1dauvpw": {
              display: "none",
            },
            "& .cl-internal-1k7jtru": {
              backgroundImage: "none",
            },
          },
          footerAction: {
            backgroundColor: "oklch(0.2 0.1 258.72)",
            display: "none",
            justifyContent: "center",
          },
          footerActionText: {
            color: "oklch(0.9392 0.0166 250.8453)",
          },
          footerActionLink: {
            color: "oklch(0.8341 0.0908 238.1044)",
            "&:hover": {
              color: "oklch(0.8341 0.0908 238.1044 / 0.8)",
            },
          },
        },
      }}
    />
  );
}
