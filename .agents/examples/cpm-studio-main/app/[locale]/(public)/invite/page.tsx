import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { InvitationAcceptExistingAccountForm } from "@/components/invitations/invitation-accept-existing-account-form";
import { InvitationAcceptForm } from "@/components/invitations/invitation-accept-form";
import { InvitationSignOutButton } from "@/components/invitations/invitation-sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { requireLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import type { LocaleParams } from "@/i18n/params";
import { getCurrentConvexUser } from "@/lib/auth/server";
import { ROUTES } from "@/lib/navigation/routes";
import { getTenantHostUrl } from "@/lib/tenancy/domain";

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("pages.invite"),
  };
}

function normalizeEmail(email: string | undefined | null) {
  return email?.trim().toLowerCase() ?? "";
}

// Coarse "now" for the public-invite query: rounding to the minute keeps the
// Convex query cache stable across rapid SSR re-renders without leaking
// `Date.now()` into a React component body (react-hooks/purity).
const INVITE_QUERY_NOW_BUCKET_MS = 60_000;
function currentInviteQueryNow() {
  return (
    Math.floor(Date.now() / INVITE_QUERY_NOW_BUCKET_MS) *
    INVITE_QUERY_NOW_BUCKET_MS
  );
}

function InvitationStatusCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {action ? <CardContent className="flex justify-center">{action}</CardContent> : null}
    </Card>
  );
}

type ResolvedInvitation =
  | {
      scope: "platform";
      state: "pending" | "accepted" | "expired" | "revoked";
      email: string;
      title: string;
      description: string;
      successHref: string;
      authProviderId: "platform-invitation";
    }
  | {
      scope: "organization";
      state: "pending" | "accepted" | "expired" | "revoked";
      email: string;
      title: string;
      description: string;
      successHref: string;
      authProviderId: "organization-invitation";
    };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const [t, commonT, { token }] = await Promise.all([
    getTranslations("Invite"),
    getTranslations("Common"),
    searchParams,
  ]);
  const inviteToken = typeof token === "string" ? token : null;

  if (!inviteToken) {
    return (
      <AuthPageShell appName={commonT("appName")}>
        <InvitationStatusCard
          title={t("title")}
          description={t("inviteInvalid")}
        />
      </AuthPageShell>
    );
  }

  const queryNow = currentInviteQueryNow();
  const [platformInvitation, organizationInvitation, currentUser] = await Promise.all([
    fetchQuery(api.platform.invitations.getPublicByToken, {
      token: inviteToken,
      now: queryNow,
    }),
    fetchQuery(api.platform.organizationInvitations.getPublicByToken, {
      token: inviteToken,
      now: queryNow,
    }),
    getCurrentConvexUser(),
  ]);
  const invitation: ResolvedInvitation | null =
    organizationInvitation.state !== "invalid"
      ? {
          scope: "organization",
          state: organizationInvitation.state,
          email: organizationInvitation.email,
          title: t("organizationTitle", {
            organizationName: organizationInvitation.organizationName,
          }),
          description: t("organizationAcceptInviteDescription", {
            organizationName: organizationInvitation.organizationName,
          }),
          successHref: getTenantHostUrl(
            organizationInvitation.organizationSlug,
            locale,
            ROUTES.tenant.root(organizationInvitation.organizationSlug),
          ),
          authProviderId: "organization-invitation",
        }
      : platformInvitation.state !== "invalid"
        ? {
            scope: "platform",
            state: platformInvitation.state,
            email: platformInvitation.email,
            title: t("platformTitle"),
            description: t("platformAcceptInviteDescription"),
            successHref: ROUTES.institutions.root,
            authProviderId: "platform-invitation",
          }
        : null;

  const inviteHref = `${ROUTES.auth.invite}?token=${encodeURIComponent(inviteToken)}`;
  const signInHref = `${ROUTES.auth.signIn}?redirectTo=${encodeURIComponent(inviteHref)}`;

  if (
    invitation?.scope === "platform" &&
    currentUser?.platformRole &&
    normalizeEmail(currentUser.email) ===
      normalizeEmail(invitation.email)
  ) {
    return redirect({ href: ROUTES.institutions.root, locale });
  }

  return (
    <AuthPageShell appName={commonT("appName")}>
      <IntlMessagesProvider
        namespaces={["Invite", "Common"]}
      >
        {!invitation ? (
          <InvitationStatusCard
            title={t("title")}
            description={t("inviteInvalid")}
          />
        ) : invitation.state === "pending" ? (
          currentUser ? (
            normalizeEmail(currentUser.email) === normalizeEmail(invitation.email) ? (
              <InvitationStatusCard
                title={invitation.title}
                description={invitation.description}
                action={
                  <InvitationAcceptExistingAccountForm
                    inviteToken={inviteToken}
                    scope={invitation.scope}
                    successHref={invitation.successHref}
                  />
                }
              />
            ) : (
              <InvitationStatusCard
                title={t("wrongAccountTitle")}
                description={t("wrongAccountDescription")}
                action={<InvitationSignOutButton label={t("signOutAndContinue")} />}
              />
            )
            ) : (
            <InvitationAcceptForm
              authProviderId={invitation.authProviderId}
              description={invitation.description}
              email={invitation.email}
              inviteToken={inviteToken}
              signInHref={signInHref}
              successHref={invitation.successHref}
            />
          )
        ) : invitation.state === "accepted" ? (
          <InvitationStatusCard
            title={invitation.title}
            description={t("inviteAccepted")}
            action={
              <Button asChild>
                <Link href={signInHref}>{t("signInInstead")}</Link>
              </Button>
            }
          />
        ) : invitation.state === "expired" ? (
          <InvitationStatusCard
            title={invitation.title}
            description={t("inviteExpired")}
          />
        ) : invitation.state === "revoked" ? (
          <InvitationStatusCard
            title={invitation.title}
            description={t("inviteRevoked")}
          />
        ) : (
          <InvitationStatusCard
            title={t("title")}
            description={t("inviteInvalid")}
          />
        )}
      </IntlMessagesProvider>
    </AuthPageShell>
  );
}
