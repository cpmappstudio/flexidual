import { httpRouter } from "convex/server";
import { verifyWebhook, type WebhookEvent } from "@clerk/backend/webhooks";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Webhook endpoint for Clerk user events
 * This endpoint is called by Clerk whenever a user is created, updated, or deleted
 *
 * Setup instructions:
 * 1. Go to Clerk Dashboard > Webhooks > Add Endpoint
 * 2. Set Endpoint URL to: https://<your-deployment>.convex.site/clerk-users-webhook
 * 3. Subscribe to: user.created, user.updated, user.deleted events
 * 4. Copy the Signing Secret and set it as CLERK_WEBHOOK_SIGNING_SECRET in Convex.
 */
http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = await validateClerkWebhook(request);
    if (!event) {
      return new Response("Error validating webhook", { status: 400 });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: {
            id: event.data.id,
            email_addresses: event.data.email_addresses.map((email) => ({
              email_address: email.email_address,
            })),
            first_name: event.data.first_name ?? undefined,
            last_name: event.data.last_name ?? undefined,
            username: event.data.username ?? undefined,
            image_url: event.data.image_url,
            public_metadata: {
              ...(typeof event.data.public_metadata?.school === "string"
                ? { school: event.data.public_metadata.school }
                : {}),
            },
          },
        });
        break;

      case "user.deleted":
        if (event.data.id) {
          await ctx.runMutation(internal.users.deleteFromClerk, {
            clerkUserId: event.data.id,
          });
        }
        break;

      default:
        console.log("Ignored Clerk webhook event", event.type);
    }

    return new Response(null, { status: 200 });
  }),
});

async function validateClerkWebhook(
  req: Request,
): Promise<WebhookEvent | null> {
  const signingSecret =
    process.env.CLERK_WEBHOOK_SIGNING_SECRET ??
    process.env.CLERK_WEBHOOK_SECRET;
  if (!signingSecret) {
    console.error("Clerk webhook signing secret is not configured");
    return null;
  }

  try {
    return await verifyWebhook(req, { signingSecret });
  } catch (error) {
    console.error("Error verifying Clerk webhook", error);
    return null;
  }
}

// ============================================================================
// LIVEKIT WEBHOOK
// ============================================================================

/**
 * LiveKit calls this endpoint for room, participant, and egress events.
 *
 * Setup instructions:
 * 1. Go to LiveKit Cloud Dashboard → your project → Webhooks → Add Webhook
 * 2. Set the URL to: https://<your-deployment>.convex.site/livekit-egress-webhook
 * 3. Select your existing API key for signing — LiveKit signs webhooks with your
 *    API key + secret (LIVEKIT_API_KEY / LIVEKIT_API_SECRET, already in Convex env vars)
 */
http.route({
  path: "/livekit-egress-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const authorization = request.headers.get("Authorization") ?? "";

    const result = await ctx.runAction(internal.livekit.processEgressWebhook, {
      body,
      authorization,
    });

    if (!result.ok) {
      return new Response(result.error, { status: result.status });
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
