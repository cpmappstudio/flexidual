import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { syncApplicationFeeSummary } from "./lib/feeSummary";

// Square API configuration
const SQUARE_API_VERSION = "2024-01-18";
const SQUARE_API_URL =
  process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

/**
 * Create a Square Payment Link for selected fees.
 */
export const createPaymentLink = action({
  args: {
    applicationId: v.id("applications"),
    feeIds: v.array(v.id("fees")),
    redirectUrl: v.string(),
  },
  returns: v.object({
    paymentUrl: v.string(),
    paymentLinkId: v.string(),
    orderId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Validate environment variables
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!accessToken || !locationId) {
      throw new Error("Square credentials not configured");
    }

    // Get fees and validate
    const feesData = await ctx.runQuery(internal.square.getFeesForPayment, {
      feeIds: args.feeIds,
      applicationId: args.applicationId,
    });

    if (!feesData || feesData.fees.length === 0) {
      throw new Error("No valid fees found for payment");
    }

    type FeeData = (typeof feesData.fees)[number];

    // Calculate total amount
    const totalAmount = feesData.fees.reduce((sum: number, fee: FeeData) => {
      const remaining = fee.totalAmount - fee.paidAmount;
      // Use minimum of remaining or down payment amount
      const downPaymentAmount = Math.ceil(
        (fee.totalAmount * fee.downPaymentPercent) / 100,
      );
      const minPayment =
        fee.paidAmount > 0 ? remaining : Math.max(downPaymentAmount, remaining);
      return sum + Math.min(remaining, minPayment);
    }, 0);

    if (totalAmount <= 0) {
      throw new Error("No payment amount due");
    }

    // Build line items for Square
    const lineItems = feesData.fees.map((fee: FeeData) => {
      const remaining = fee.totalAmount - fee.paidAmount;
      return {
        name: fee.name,
        quantity: "1",
        base_price_money: {
          amount: remaining,
          currency: "USD",
        },
      };
    });

    // Generate idempotency key
    const idempotencyKey = crypto.randomUUID();

    // Create Payment Link via Square API
    const response: Response = await fetch(
      `${SQUARE_API_URL}/v2/online-checkout/payment-links`,
      {
        method: "POST",
        headers: {
          "Square-Version": SQUARE_API_VERSION,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          order: {
            location_id: locationId,
            line_items: lineItems,
            metadata: {
              application_id: args.applicationId,
              fee_ids: args.feeIds.join(","),
            },
          },
          checkout_options: {
            redirect_url: args.redirectUrl,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Square API error:", errorData);
      throw new Error(
        `Square API error: ${errorData.errors?.[0]?.detail || "Unknown error"}`,
      );
    }

    const data = (await response.json()) as {
      payment_link: { id: string; order_id: string; url: string };
    };
    const paymentLink = data.payment_link;

    // Store payment link in database
    await ctx.runMutation(internal.square.storePaymentLink, {
      applicationId: args.applicationId,
      feeIds: args.feeIds,
      squareLinkId: paymentLink.id,
      squareOrderId: paymentLink.order_id,
      squareUrl: paymentLink.url,
      totalAmount,
      idempotencyKey,
    });

    return {
      paymentUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
      orderId: paymentLink.order_id,
    };
  },
});

/**
 * Internal query to get fees for payment validation.
 */
export const getFeesForPayment = internalQuery({
  args: {
    feeIds: v.array(v.id("fees")),
    applicationId: v.id("applications"),
  },
  returns: v.union(
    v.object({
      fees: v.array(
        v.object({
          _id: v.id("fees"),
          name: v.string(),
          totalAmount: v.number(),
          paidAmount: v.number(),
          downPaymentPercent: v.number(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const fees = [];

    for (const feeId of args.feeIds) {
      const fee = await ctx.db.get(feeId);
      if (!fee) continue;

      // Verify fee belongs to the application
      if (fee.applicationId !== args.applicationId) {
        throw new Error("Fee does not belong to this application");
      }

      // Only include fees that aren't fully paid
      if (fee.status !== "paid") {
        fees.push({
          _id: fee._id,
          name: fee.name,
          totalAmount: fee.totalAmount,
          paidAmount: fee.paidAmount,
          downPaymentPercent: fee.downPaymentPercent,
        });
      }
    }

    return { fees };
  },
});

/**
 * Internal mutation to store payment link.
 */
export const storePaymentLink = internalMutation({
  args: {
    applicationId: v.id("applications"),
    feeIds: v.array(v.id("fees")),
    squareLinkId: v.string(),
    squareOrderId: v.string(),
    squareUrl: v.string(),
    totalAmount: v.number(),
    idempotencyKey: v.string(),
  },
  returns: v.id("paymentLinks"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("paymentLinks", {
      applicationId: args.applicationId,
      feeIds: args.feeIds,
      squareLinkId: args.squareLinkId,
      squareOrderId: args.squareOrderId,
      squareUrl: args.squareUrl,
      totalAmount: args.totalAmount,
      status: "pending",
      idempotencyKey: args.idempotencyKey,
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal mutation to check if a webhook event was already processed.
 */
export const isEventProcessed = internalQuery({
  args: { eventId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("webhookEvents")
      .withIndex("byEventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    return !!event;
  },
});

/**
 * Internal mutation to mark a webhook event as processed.
 */
export const markEventProcessed = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Internal mutation to handle completed payment from webhook.
 */
export const handlePaymentCompleted = internalMutation({
  args: {
    squareOrderId: v.string(),
    squarePaymentId: v.string(),
    amountPaid: v.number(),
    receiptUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find the payment link by Square order ID
    const paymentLink = await ctx.db
      .query("paymentLinks")
      .withIndex("bySquareOrderId", (q) =>
        q.eq("squareOrderId", args.squareOrderId),
      )
      .unique();

    if (!paymentLink) {
      console.error(`Payment link not found for order: ${args.squareOrderId}`);
      return null;
    }

    if (paymentLink.status === "completed") {
      // Already processed
      return null;
    }

    // Update payment link status
    await ctx.db.patch(paymentLink._id, {
      status: "completed",
      completedAt: Date.now(),
    });

    // Distribute payment across fees proportionally
    const fees: Array<{
      _id: Id<"fees">;
      totalAmount: number;
      paidAmount: number;
    }> = [];
    let totalRemaining = 0;

    for (const feeId of paymentLink.feeIds) {
      const fee = await ctx.db.get(feeId);
      if (fee && fee.status !== "paid") {
        const remaining = fee.totalAmount - fee.paidAmount;
        fees.push({
          _id: fee._id,
          totalAmount: fee.totalAmount,
          paidAmount: fee.paidAmount,
        });
        totalRemaining += remaining;
      }
    }

    // Distribute payment proportionally
    let remainingPayment = args.amountPaid;

    for (const fee of fees) {
      const feeRemaining = fee.totalAmount - fee.paidAmount;
      const proportion = feeRemaining / totalRemaining;
      const paymentForFee = Math.min(
        Math.round(args.amountPaid * proportion),
        feeRemaining,
        remainingPayment,
      );

      if (paymentForFee <= 0) continue;

      remainingPayment -= paymentForFee;

      // Create transaction
      await ctx.db.insert("transactions", {
        applicationId: paymentLink.applicationId,
        feeId: fee._id,
        amount: paymentForFee,
        method: "online",
        status: "completed",
        squarePaymentId: args.squarePaymentId,
        squareOrderId: args.squareOrderId,
        receiptUrl: args.receiptUrl,
        createdAt: Date.now(),
        completedAt: Date.now(),
      });

      // Update fee
      const newPaidAmount = fee.paidAmount + paymentForFee;
      const newStatus =
        newPaidAmount >= fee.totalAmount ? "paid" : "partially_paid";

      await ctx.db.patch(fee._id, {
        paidAmount: newPaidAmount,
        status: newStatus,
        ...(newStatus === "paid" ? { paidAt: Date.now() } : {}),
      });
    }

    await syncApplicationFeeSummary(ctx, paymentLink.applicationId);

    return null;
  },
});

/**
 * Get payment link by Square order ID.
 */
export const getPaymentLinkByOrderId = internalQuery({
  args: { squareOrderId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("paymentLinks"),
      applicationId: v.id("applications"),
      status: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const paymentLink = await ctx.db
      .query("paymentLinks")
      .withIndex("bySquareOrderId", (q) =>
        q.eq("squareOrderId", args.squareOrderId),
      )
      .unique();

    if (!paymentLink) return null;

    return {
      _id: paymentLink._id,
      applicationId: paymentLink.applicationId,
      status: paymentLink.status,
    };
  },
});
