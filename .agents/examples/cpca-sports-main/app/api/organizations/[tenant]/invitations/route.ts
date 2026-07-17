import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isAdminFromSessionClaims } from "@/lib/auth/roles";
import { locales, routing, type Locale } from "@/i18n/routing";
import { DEFAULT_TENANT_SLUG, isSingleTenantMode } from "@/lib/tenancy/config";

const MULTI_TENANT_INVITABLE_ROLES = ["org:member", "org:admin"] as const;
const SINGLE_TENANT_INVITABLE_ROLES = ["member", "admin"] as const;
type MultiTenantInvitableRole = (typeof MULTI_TENANT_INVITABLE_ROLES)[number];
type SingleTenantInvitableRole = (typeof SINGLE_TENANT_INVITABLE_ROLES)[number];
type InvitationAccessContext =
  | {
      mode: "single";
      userId: string;
    }
  | {
      mode: "multi";
      userId: string;
      organizationId: string;
    };

interface RouteContext {
  params: Promise<{ tenant: string }>;
}

class InvitationAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function canManageInvitations(role: string | null | undefined) {
  return role === "org:admin" || role === "org:superadmin";
}

function isMultiTenantInvitableRole(
  role: unknown,
): role is MultiTenantInvitableRole {
  return (
    typeof role === "string" &&
    MULTI_TENANT_INVITABLE_ROLES.includes(role as MultiTenantInvitableRole)
  );
}

function isSingleTenantInvitableRole(
  role: unknown,
): role is SingleTenantInvitableRole {
  return (
    typeof role === "string" &&
    SINGLE_TENANT_INVITABLE_ROLES.includes(role as SingleTenantInvitableRole)
  );
}

function resolveLocale(value: unknown): Locale {
  if (typeof value === "string" && locales.includes(value as Locale)) {
    return value as Locale;
  }
  return routing.defaultLocale;
}

function resolveErrorStatus(error: unknown): number {
  if (error instanceof InvitationAccessError) {
    return error.status;
  }

  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") {
    return status;
  }

  const errors = (error as { errors?: Array<{ code?: string }> })?.errors;
  if (errors?.some((item) => item.code === "resource_not_found")) {
    return 404;
  }

  return 500;
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  const errors = (error as { errors?: Array<{ message?: string }> })?.errors;
  const firstMessage = errors?.find(
    (item) => typeof item.message === "string",
  )?.message;

  return firstMessage ?? fallback;
}

async function requireInvitationAccess(
  tenant: string,
): Promise<InvitationAccessContext> {
  if (isSingleTenantMode()) {
    const authObject = await auth();
    if (!authObject.userId) {
      throw new InvitationAccessError(401, "Unauthorized");
    }
    if (tenant !== DEFAULT_TENANT_SLUG) {
      throw new InvitationAccessError(404, "Organization not found");
    }
    if (!isAdminFromSessionClaims(authObject.sessionClaims)) {
      throw new InvitationAccessError(403, "Forbidden");
    }

    return { mode: "single", userId: authObject.userId };
  }

  const authObject = await auth();
  const { userId, orgId, orgSlug, has } = authObject;

  if (!userId) {
    throw new InvitationAccessError(401, "Unauthorized");
  }

  const hasActiveOrgAccess =
    orgSlug === tenant &&
    orgId &&
    (has?.({ role: "org:admin" }) || has?.({ role: "org:superadmin" }));

  if (hasActiveOrgAccess) {
    return { mode: "multi", userId, organizationId: orgId };
  }

  const client = await clerkClient();
  const organization = await client.organizations.getOrganization({
    slug: tenant,
  });

  const memberships = await client.users.getOrganizationMembershipList({
    userId,
    limit: 200,
  });

  const membership = memberships.data.find(
    (item) => item.organization.id === organization.id,
  );

  if (!membership) {
    throw new InvitationAccessError(403, "Forbidden");
  }

  if (!canManageInvitations(membership.role)) {
    throw new InvitationAccessError(403, "Forbidden");
  }

  return { mode: "multi", userId, organizationId: organization.id };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenant } = await params;
    const accessContext = await requireInvitationAccess(tenant);

    const body = (await request.json()) as {
      emailAddress?: unknown;
      role?: unknown;
      locale?: unknown;
    };

    const emailAddress =
      typeof body.emailAddress === "string" ? body.emailAddress.trim() : "";
    if (!emailAddress) {
      return NextResponse.json(
        { error: "Email address is required" },
        { status: 400 },
      );
    }

    const locale = resolveLocale(body.locale);
    const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    const redirectUrl = new URL(
      `${localePrefix}/${tenant}/sign-up`,
      request.url,
    ).toString();

    const client = await clerkClient();
    if (accessContext.mode === "single") {
      if (!isSingleTenantInvitableRole(body.role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      const invitation = await client.invitations.createInvitation({
        emailAddress,
        redirectUrl,
        publicMetadata: { role: body.role },
      });

      return NextResponse.json({
        invitation: {
          id: invitation.id,
          emailAddress: invitation.emailAddress,
          role: body.role,
        },
      });
    }

    if (!isMultiTenantInvitableRole(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: accessContext.organizationId,
      inviterUserId: accessContext.userId,
      emailAddress,
      role: body.role,
      redirectUrl,
    });

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        role: invitation.role,
      },
    });
  } catch (error) {
    const status = resolveErrorStatus(error);
    const fallbackMessage =
      status >= 500
        ? "Failed to create invitation"
        : "Unable to create invitation";
    const message = resolveErrorMessage(error, fallbackMessage);

    return NextResponse.json({ error: message }, { status });
  }
}
