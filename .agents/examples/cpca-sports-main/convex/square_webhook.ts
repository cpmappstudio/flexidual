"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import crypto from "crypto";
import { v } from "convex/values";

export const verifyAndProcessSquareWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
    notificationUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!signatureKey) {
      throw new Error("SQUARE_WEBHOOK_SIGNATURE_KEY not configured");
    }

    // Verify Square webhook signature
    const hmac = crypto.createHmac("sha256", signatureKey);
    hmac.update(args.notificationUrl + args.body);
    const expectedSignature = hmac.digest("base64");

    if (args.signature !== expectedSignature) {
      throw new Error("Invalid signature");
    }

    // Parse the event
    let event;
    try {
      event = JSON.parse(args.body);
    } catch {
      throw new Error("Invalid JSON");
    }

    const eventId = event.event_id;
    if (!eventId) {
      throw new Error("Missing event_id");
    }

    // Check idempotency
    const isProcessed = await ctx.runQuery(internal.square.isEventProcessed, {
      eventId,
    });

    if (isProcessed) {
      return { status: "already_processed" };
    }

    // Handle payment events
    // Square sends payment.created and payment.updated events
    // We check for status === "COMPLETED" to process successful payments
    const eventType = event.type;
    if (eventType === "payment.created" || eventType === "payment.updated") {
      const payment = event.data?.object?.payment;

      if (payment && payment.status === "COMPLETED") {
        const orderId = payment.order_id;
        const paymentId = payment.id;
        const amountPaid = payment.amount_money?.amount || 0;
        const receiptUrl = payment.receipt_url;

        if (orderId) {
          await ctx.runMutation(internal.square.handlePaymentCompleted, {
            squareOrderId: orderId,
            squarePaymentId: paymentId,
            amountPaid,
            receiptUrl,
          });
        }
      }
    }

    // Mark event as processed
    await ctx.runMutation(internal.square.markEventProcessed, {
      eventId,
      eventType,
    });

    return { status: "ok" };
  },
});
