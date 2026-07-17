import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/backend";
import { internal } from "./_generated/api";
import { clerkClient } from "./clerk";
import { DEFAULT_TENANT_SLUG, isSingleTenantMode } from "./lib/tenancy";

// Centralized webhook endpoint paths
const CLERK_WEBHOOK_PATH = "/clerk-webhook";
const SQUARE_WEBHOOK_PATH = "/square-webhook";
const SINGLE_TENANT_MODE = isSingleTenantMode();

type SingleTenantResolvedRole = "superadmin" | "admin" | "member";

function normalizeSingleTenantMetadataRole(
  role: unknown,
): "admin" | "member" | null {
  if (role === "admin" || role === "member") {
    return role;
  }
  if (role === "org:admin" || role === "org:superadmin") {
    return "admin";
  }
  if (role === "org:member") {
    return "member";
  }
  return null;
}

function metadataRoleFromResolvedRole(
  role: SingleTenantResolvedRole,
): "admin" | "member" {
  return role === "superadmin" || role === "admin" ? "admin" : "member";
}

async function ensureSingleTenantMetadataRole(
  data: {
    id: string;
    public_metadata?: {
      role?: unknown;
      isSuperAdmin?: unknown;
      [key: string]: unknown;
    };
  },
  resolvedRole: SingleTenantResolvedRole,
) {
  const normalizedCurrentRole = normalizeSingleTenantMetadataRole(
    data.public_metadata?.role,
  );
  const desiredRole =
    normalizedCurrentRole ?? metadataRoleFromResolvedRole(resolvedRole);
  const hasCanonicalRole = data.public_metadata?.role === desiredRole;

  if (hasCanonicalRole) {
    return;
  }

  await clerkClient.users.updateUserMetadata(data.id, {
    publicMetadata: {
      ...(data.public_metadata ?? {}),
      role: desiredRole,
    },
  });
}

function resolveSingleTenantRole(data: {
  public_metadata?: {
    role?: unknown;
    isSuperAdmin?: unknown;
  };
}): SingleTenantResolvedRole {
  // SuperAdmin is a separate flag and must always win, regardless of `role`.
  // Otherwise normalizing `role` (e.g. superadmin -> admin) can unintentionally downgrade
  // the app membership when a user updates their profile (photo/name/etc).
  if (data.public_metadata?.isSuperAdmin === true) {
    return "superadmin";
  }

  const role = data.public_metadata?.role;
  if (role === "superadmin" || role === "org:superadmin") {
    return "superadmin";
  }
  if (role === "admin" || role === "org:admin") {
    return "admin";
  }
  if (role === "member" || role === "org:member") {
    return "member";
  }
  return "member";
}

const handleClerkWebhook = httpAction(async (ctx, request) => {
  const event = await validateClerkRequest(request);
  if (!event) {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      // User events
      case "user.created": {
        const resolvedRole = resolveSingleTenantRole(event.data);
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: event.data,
        });

        if (SINGLE_TENANT_MODE) {
          await ensureSingleTenantMetadataRole(event.data, resolvedRole);
          await ctx.runMutation(internal.members.upsertFromSingleTenant, {
            clerkUserId: event.data.id,
            organizationSlug: DEFAULT_TENANT_SLUG,
            role: resolvedRole,
          });
          break;
        }

        // Auto-add user to organization if pendingOrganizationSlug is set
        const pendingOrgSlug = event.data.unsafe_metadata
          ?.pendingOrganizationSlug as string | undefined;
        if (pendingOrgSlug) {
          // Find organization by slug in Clerk
          const orgsResponse =
            await clerkClient.organizations.getOrganizationList({
              query: pendingOrgSlug,
            });
          const org = orgsResponse.data.find((o) => o.slug === pendingOrgSlug);

          if (org) {
            // Add user to organization with default member role
            await clerkClient.organizations.createOrganizationMembership({
              organizationId: org.id,
              userId: event.data.id,
              role: "org:member",
            });

            // Clear the pending metadata
            await clerkClient.users.updateUser(event.data.id, {
              unsafeMetadata: {
                ...event.data.unsafe_metadata,
                pendingOrganizationSlug: undefined,
              },
            });
          }
        }
        break;
      }

      case "user.updated": {
        const resolvedRole = resolveSingleTenantRole(event.data);
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: event.data,
        });
        if (SINGLE_TENANT_MODE) {
          await ensureSingleTenantMetadataRole(event.data, resolvedRole);
          await ctx.runMutation(internal.members.upsertFromSingleTenant, {
            clerkUserId: event.data.id,
            organizationSlug: DEFAULT_TENANT_SLUG,
            role: resolvedRole,
          });
        }
        break;
      }

      case "user.deleted":
        if (event.data?.id) {
          await ctx.runMutation(internal.users.deactivateUser, {
            clerkId: event.data.id,
          });
        }
        break;

      // Organization events
      case "organization.created":
        if (SINGLE_TENANT_MODE) {
          break;
        }
        await ctx.runMutation(internal.organizations.createFromClerk, {
          clerkOrgId: event.data.id,
          name: event.data.name,
          slug: event.data.slug ?? event.data.id,
          imageUrl: event.data.image_url ?? undefined,
        });
        break;

      case "organization.updated":
        if (SINGLE_TENANT_MODE) {
          break;
        }
        await ctx.runMutation(internal.organizations.updateFromClerk, {
          clerkOrgId: event.data.id,
          name: event.data.name,
          slug: event.data.slug ?? event.data.id,
          imageUrl: event.data.image_url ?? undefined,
        });
        break;

      case "organization.deleted":
        if (SINGLE_TENANT_MODE) {
          break;
        }
        if (event.data.id) {
          await ctx.runMutation(internal.organizations.deleteFromClerk, {
            clerkOrgId: event.data.id,
          });
        }
        break;

      // Organization membership events
      case "organizationMembership.created":
      case "organizationMembership.updated":
        if (SINGLE_TENANT_MODE) {
          break;
        }
        await ctx.runMutation(internal.members.upsertFromClerk, {
          data: event.data,
        });
        break;

      case "organizationMembership.deleted":
        if (SINGLE_TENANT_MODE) {
          break;
        }
        await ctx.runMutation(internal.members.deleteFromClerk, {
          data: event.data,
        });
        break;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const err = error as Error;
    console.error(`Webhook error: ${err.message}`);
    // Return 200 to prevent Clerk from retrying infinitely
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

const handleSquareWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");

  if (!signature) {
    return new Response("Missing signature", { status: 401 });
  }

  const notificationUrl = process.env.CONVEX_SITE_URL + SQUARE_WEBHOOK_PATH;

  try {
    // Use Node.js action to verify signature and process webhook
    const result = await ctx.runAction(
      internal.square_webhook.verifyAndProcessSquareWebhook,
      {
        body,
        signature,
        notificationUrl,
      },
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const err = error as Error;
    console.error(`Square webhook error: ${err.message}`);

    // Return appropriate error status
    if (err.message === "Invalid signature") {
      return new Response("Invalid signature", { status: 401 });
    }

    if (err.message === "SQUARE_WEBHOOK_SIGNATURE_KEY not configured") {
      return new Response("Webhook not configured", { status: 500 });
    }

    // Return 200 for other errors to prevent Square from retrying infinitely
    return new Response(
      JSON.stringify({ status: "error", message: err.message }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

const http = httpRouter();

http.route({
  path: CLERK_WEBHOOK_PATH,
  method: "POST",
  handler: handleClerkWebhook,
});

http.route({
  path: SQUARE_WEBHOOK_PATH,
  method: "POST",
  handler: handleSquareWebhook,
});

async function validateClerkRequest(
  request: Request,
): Promise<WebhookEvent | undefined> {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET not configured");
    return undefined;
  }

  const payload = await request.text();
  const svixHeaders = {
    "svix-id": request.headers.get("svix-id") || "",
    "svix-timestamp": request.headers.get("svix-timestamp") || "",
    "svix-signature": request.headers.get("svix-signature") || "",
  };

  const wh = new Webhook(webhookSecret);
  try {
    const event = wh.verify(payload, svixHeaders) as WebhookEvent;
    return event;
  } catch (err) {
    const error = err as Error;
    console.error(`Webhook verification failed: ${error.message}`);
    return undefined;
  }
}

export default http;
