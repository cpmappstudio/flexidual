# Square Payments Integration Guide

This document provides instructions for integrating Square payments into the CPM Payments app using Next.js App Router, Convex, and modern best practices.

## Overview

Square offers two main approaches for online payments:

1. **Payment Links (Checkout API)** - Redirect users to Square-hosted checkout pages
2. **Web Payments SDK** - Embed payment forms directly in your app

Both approaches are valid. Payment Links are simpler to implement, while the Web SDK provides more control over the UI.

## Approach 1: Payment Links (Recommended for MVP)

This is the approach used by the legacy app and is the quickest way to start accepting payments.

### API Endpoint

```
POST https://connect.squareup.com/v2/online-checkout/payment-links
```

### Required Headers

```typescript
const headers = {
  'Square-Version': '2026-01-22',
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
};
```

### Request Structure

#### Quick Pay (Simple)

```typescript
interface QuickPayRequest {
  idempotency_key: string; // UUID, max 192 chars
  quick_pay: {
    name: string;
    price_money: {
      amount: number; // In cents (1000 = $10.00)
      currency: 'USD';
    };
    location_id: string;
  };
  checkout_options?: {
    redirect_url?: string;
    allow_tipping?: boolean;
  };
  pre_populated_data?: {
    buyer_email?: string;
    buyer_phone_number?: string;
  };
}
```

#### Order Checkout (Complex)

```typescript
interface OrderCheckoutRequest {
  idempotency_key: string;
  order: {
    location_id: string;
    line_items: Array<{
      name: string;
      quantity: string; // Must be string
      base_price_money: {
        amount: number;
        currency: 'USD';
      };
    }>;
  };
  checkout_options?: {
    redirect_url?: string;
  };
}
```

### Response Structure

```typescript
interface PaymentLinkResponse {
  payment_link: {
    id: string;
    version: number;
    order_id: string;
    url: string;      // Short URL: https://square.link/u/xxx
    long_url: string;
    created_at: string;
  };
  related_resources?: {
    orders: Order[];
  };
}
```

### Implementation with Convex Actions

```typescript
// convex/square.ts
import { action } from "./_generated/server";
import { v } from "convex/values";

export const createPaymentLink = action({
  args: {
    applicationId: v.id("applications"),
    feeIds: v.array(v.string()),
    totalAmount: v.number(), // In cents
    description: v.string(),
    redirectUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const idempotencyKey = crypto.randomUUID();
    
    const response = await fetch(
      'https://connect.squareup.com/v2/online-checkout/payment-links',
      {
        method: 'POST',
        headers: {
          'Square-Version': '2026-01-22',
          'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          quick_pay: {
            name: args.description,
            price_money: {
              amount: args.totalAmount,
              currency: 'USD',
            },
            location_id: process.env.SQUARE_LOCATION_ID,
          },
          checkout_options: {
            redirect_url: args.redirectUrl,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Square API error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    
    // Store payment attempt in database
    await ctx.runMutation(internal.payments.createPaymentAttempt, {
      applicationId: args.applicationId,
      feeIds: args.feeIds,
      squareOrderId: data.payment_link.order_id,
      squarePaymentLinkId: data.payment_link.id,
      idempotencyKey,
      amount: args.totalAmount,
      status: 'pending',
    });

    return {
      paymentUrl: data.payment_link.url,
      orderId: data.payment_link.order_id,
    };
  },
});
```

## Approach 2: Web Payments SDK (Embedded Form)

For more control over the payment experience, use the Web Payments SDK.

### Installation

```bash
npm install react-square-web-payments-sdk square
```

### Environment Variables

```env
SQUARE_ACCESS_TOKEN=your_access_token
NEXT_PUBLIC_SQUARE_APP_ID=your_app_id
NEXT_PUBLIC_SQUARE_LOCATION_ID=your_location_id
```

### Payment Form Component

```tsx
// components/payment-form.tsx
"use client";

import { CreditCard, PaymentForm } from "react-square-web-payments-sdk";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

interface PaymentFormProps {
  applicationId: string;
  feeIds: string[];
  amount: number;
  onSuccess: () => void;
  onError: (error: string) => void;
}

export function SquarePaymentForm({
  applicationId,
  feeIds,
  amount,
  onSuccess,
  onError,
}: PaymentFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const processPayment = useAction(api.square.processPayment);

  return (
    <PaymentForm
      applicationId={process.env.NEXT_PUBLIC_SQUARE_APP_ID!}
      locationId={process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!}
      cardTokenizeResponseReceived={async (token) => {
        if (!token.token) {
          onError("Failed to tokenize card");
          return;
        }

        setIsProcessing(true);
        try {
          const result = await processPayment({
            sourceId: token.token,
            applicationId,
            feeIds,
            amount,
          });
          
          if (result.success) {
            onSuccess();
          } else {
            onError(result.error || "Payment failed");
          }
        } catch (error) {
          onError(error instanceof Error ? error.message : "Payment failed");
        } finally {
          setIsProcessing(false);
        }
      }}
    >
      <CreditCard />
    </PaymentForm>
  );
}
```

### Server-Side Payment Processing

```typescript
// convex/square.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { Client, Environment } from "square";

const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production, // or Environment.Sandbox
});

export const processPayment = action({
  args: {
    sourceId: v.string(),
    applicationId: v.id("applications"),
    feeIds: v.array(v.string()),
    amount: v.number(), // In cents
  },
  handler: async (ctx, args) => {
    const idempotencyKey = crypto.randomUUID();

    try {
      const { result } = await squareClient.paymentsApi.createPayment({
        idempotencyKey,
        sourceId: args.sourceId,
        amountMoney: {
          amount: BigInt(args.amount),
          currency: 'USD',
        },
        locationId: process.env.SQUARE_LOCATION_ID,
      });

      // Record successful payment
      await ctx.runMutation(internal.payments.recordPayment, {
        applicationId: args.applicationId,
        feeIds: args.feeIds,
        squarePaymentId: result.payment?.id,
        amount: args.amount,
        status: 'completed',
        method: 'online',
      });

      return { success: true, paymentId: result.payment?.id };
    } catch (error) {
      console.error('Square payment error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Payment failed' 
      };
    }
  },
});
```

## Webhooks (Recommended for Production)

Webhooks provide reliable payment confirmation, especially for Payment Links.

### Webhook Events to Subscribe

- `payment.completed` - Payment successful
- `payment.updated` - Payment status changed
- `order.updated` - Order status changed

### Webhook Handler (Next.js Route Handler)

```typescript
// app/api/webhooks/square/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import crypto from 'crypto';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function verifySquareSignature(
  body: string,
  signature: string,
  webhookUrl: string,
  signatureKey: string
): boolean {
  const hmac = crypto.createHmac('sha256', signatureKey);
  hmac.update(webhookUrl + body);
  const expectedSignature = hmac.digest('base64');
  return signature === expectedSignature;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature');
  
  // Verify webhook signature
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/square`;
  const isValid = verifySquareSignature(
    body,
    signature || '',
    webhookUrl,
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!
  );

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(body);
  const eventId = event.event_id;

  // Check for duplicate events (idempotency)
  const processed = await convex.query(api.payments.isEventProcessed, { eventId });
  if (processed) {
    return NextResponse.json({ status: 'already_processed' });
  }

  // Handle event
  switch (event.type) {
    case 'payment.completed':
      await convex.mutation(api.payments.handlePaymentCompleted, {
        squarePaymentId: event.data.object.payment.id,
        eventId,
      });
      break;
      
    case 'payment.updated':
      await convex.mutation(api.payments.handlePaymentUpdated, {
        squarePaymentId: event.data.object.payment.id,
        status: event.data.object.payment.status,
        eventId,
      });
      break;
  }

  return NextResponse.json({ status: 'ok' });
}
```

## Database Schema for Payments

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ... existing tables ...

  fees: defineTable({
    applicationId: v.id("applications"),
    name: v.string(),
    description: v.optional(v.string()),
    totalAmount: v.number(), // In cents
    downPayment: v.number(), // Percentage (0-100)
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isDefault: v.boolean(),
    isRequired: v.boolean(),
    status: v.union(
      v.literal("pending"),
      v.literal("partially_paid"),
      v.literal("paid")
    ),
    paidAmount: v.number(), // In cents
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
  })
    .index("by_application", ["applicationId"])
    .index("by_status", ["status"]),

  transactions: defineTable({
    applicationId: v.id("applications"),
    feeId: v.id("fees"),
    amount: v.number(), // In cents
    method: v.union(v.literal("online"), v.literal("cash"), v.literal("wire")),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed")
    ),
    squarePaymentId: v.optional(v.string()),
    squareOrderId: v.optional(v.string()),
    reference: v.optional(v.string()),
    registeredBy: v.optional(v.id("users")),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_application", ["applicationId"])
    .index("by_fee", ["feeId"])
    .index("by_square_payment", ["squarePaymentId"]),

  webhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    processedAt: v.number(),
  }).index("by_event_id", ["eventId"]),
});
```

## Security Best Practices

1. **Never expose access tokens** - Store in environment variables
2. **Use idempotency keys** - Prevent duplicate payments
3. **Verify webhooks** - Check HMAC signatures
4. **Store event IDs** - Prevent duplicate processing
5. **Use HTTPS** - Required for webhooks and SDK

## Testing

### Sandbox Credentials

Use sandbox environment during development:
- URL: `https://connect.squareupsandbox.com`
- Environment: `Environment.Sandbox`

### Test Card Numbers

| Card | Number |
|------|--------|
| Visa Success | 4532015112830366 |
| Mastercard Success | 5425233430109903 |
| Card Declined | 4000000000000002 |

CVV: Any 3 digits
Expiration: Any future date
ZIP: Any 5 digits

## Migration from Legacy

When migrating from the legacy PHP app:

1. Use the same Location ID for continuity
2. Consider running both systems in parallel during transition
3. Implement webhooks for reliable payment confirmation
4. Add proper error handling and logging
5. Store all payment attempts for audit trail

## Environment Variables Summary

```env
# Square API
SQUARE_ACCESS_TOKEN=your_access_token
SQUARE_LOCATION_ID=your_location_id
SQUARE_WEBHOOK_SIGNATURE_KEY=your_webhook_key

# Public (for Web SDK)
NEXT_PUBLIC_SQUARE_APP_ID=your_app_id
NEXT_PUBLIC_SQUARE_LOCATION_ID=your_location_id

# App URL (for webhooks)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Resources

- [Square Checkout API](https://developer.squareup.com/docs/checkout-api)
- [Square Payments API](https://developer.squareup.com/docs/payments-overview)
- [Square Webhooks](https://developer.squareup.com/docs/webhooks/overview)
- [react-square-web-payments-sdk](https://github.com/weareseeed/react-square-web-payments-sdk)
- [Square Developer Dashboard](https://developer.squareup.com/apps)
