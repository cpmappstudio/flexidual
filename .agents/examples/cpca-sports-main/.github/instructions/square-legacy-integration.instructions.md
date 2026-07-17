# Square Integration - Legacy App (cpcaspor-main)

This document describes how the legacy CPCA Sports pre-admission system integrates with Square for payment processing.

## Overview

The legacy app uses **Square Checkout API** (specifically Payment Links) to process online payments. It does NOT use Square's web SDK or embedded payment forms - instead, it redirects users to Square's hosted checkout page.

## API Used

- **Endpoint**: `https://connect.squareup.com/v2/online-checkout/payment-links`
- **API Version**: `2023-04-19`
- **Method**: POST with cURL

## Authentication

```
Authorization: Bearer {ACCESS_TOKEN}
Square-Version: 2023-04-19
Content-Type: application/json
```

- Production URL: `https://connect.squareup.com/v2/online-checkout/payment-links`
- Sandbox URL: `https://connect.squareupsandbox.com/v2/online-checkout/payment-links`

## Configuration

- **Location ID**: `LE687AV85PY45` (Production)
- **Location ID**: `LH93DXB5TSMWF` (Sandbox - commented out)

## Payment Flows

### Flow 1: Initial Application Payment (`storePayment`)

Used during the pre-admission form submission for visa/boarding deposits.

**Predefined payment options**:
```php
$orders = [
    'visa' => ['amount' => 20000, 'description' => 'Visa Application'],
    'boarding' => ['amount' => 20000, 'description' => 'Boarding Housing (Non Refundable)'],
    'visaboarding' => ['amount' => 40000, 'description' => 'Visa Application & Boarding Housing (Non Refundable)']
];
```

**Note**: Amounts are in cents (20000 = $200.00 USD)

**Request payload structure**:
```json
{
  "order": {
    "location_id": "LE687AV85PY45",
    "customer_id": "{admission_id}",
    "line_items": [
      {
        "quantity": "1",
        "base_price_money": {
          "amount": 20000,
          "currency": "USD"
        },
        "name": "Visa Application"
      }
    ]
  },
  "description": "Visa Application",
  "checkout_options": {
    "redirect_url": "https://domain.com/preadmission/success-payment/{id}/{order_type}"
  }
}
```

**Response handling**:
```php
$result = json_decode(curl_exec($ch));
return redirect($result->payment_link->url);
```

### Flow 2: User Fee Payments (`userPayment`)

Used by applicants to pay assigned fees from their dashboard.

**Key differences from Flow 1**:
- Dynamically calculates total from selected fees
- Amount is multiplied by 100 (input is in dollars, API needs cents)
- Concatenates multiple fee descriptions
- Stores selected payments in session for post-payment processing

**Request payload**:
```json
{
  "order": {
    "location_id": "LE687AV85PY45",
    "customer_id": "{admission_id}",
    "line_items": [
      {
        "quantity": "1",
        "base_price_money": {
          "amount": "{total_cents}",
          "currency": "USD"
        },
        "name": "{concatenated_fee_descriptions}"
      }
    ]
  },
  "description": "{concatenated_fee_descriptions}",
  "checkout_options": {
    "redirect_url": "https://domain.com/preadmissions/cpca/c/success-payment/{id}"
  }
}
```

## Post-Payment Handling

### Success Callback (`successPayment`)

After Square redirects back to the success URL:

```php
public function successPayment($id, $order) {
    $admission = Admission::find($id);

    if($order == 'visa') {
        $admission->payment_visa = 1;
    } else if($order == 'boarding') {
        $admission->payment_boarding = 1;
    } else if($order == 'visaboarding') {
        $admission->payment_visa = 1;
        $admission->payment_boarding = 1;
    }

    $admission->save();
    return redirect()->route('success.payment', $admission->id);
}
```

### Response Payment (`responsePayment`)

For fee payments, retrieves session data and updates payment records:

```php
public function responsePayment($id) {
    $admission = Admission::find($id);
    $payments = Payment::where('p_id', $id)->get();
    $order = session($admission->code);
    
    foreach($payments as $payment) {
        if(array_key_exists('payment-'.$payment->id, $order)) {
            $record = Payment::find($payment->id);
            $record->due = $record->due + $order['amount-'.$payment->id];
            $record->p_payment = 653; // Online payment method ID
            $record->save();
        }
    }
}
```

## Database Schema (Payment Model)

Based on code analysis, the `payments` table has these fields:

| Field | Description |
|-------|-------------|
| `p_id` | Foreign key to admission |
| `p_service` | Service type ID (from Param table) |
| `description` | Custom description for "Other" services |
| `amount` | Total amount due |
| `due` | Amount paid so far |
| `pp` | Payment plan flag (0 = full payment, 1 = partial allowed) |
| `dp` | Down payment percentage (0-100) |
| `refundable` | Whether fee is refundable (0/1) |
| `included` | Whether fee is included in package (0/1) |
| `p_payment` | Payment method ID |
| `p_state` | Record state (100 = active, 101 = deleted) |

## Admin Features

### Managing Fees (`adminPayments`)

Admins can:
1. Add predefined fees from a list
2. Add custom "Other" fees with custom descriptions
3. Set down payment percentages (dp)
4. Mark as refundable/included
5. After saving, an email is sent to the applicant

### Recording Manual Payments (`record`)

Admins can record cash/wire payments manually:
- Select which fee to apply payment to
- Enter amount
- Select payment method (cash, wire, etc.)
- Updates the `due` field incrementally

## Limitations of Legacy Implementation

1. **No webhook integration** - Relies solely on redirect URLs for payment confirmation
2. **No idempotency keys** - Could cause duplicate payments on retries
3. **Session-based state** - Payment context stored in PHP session, could be lost
4. **No payment verification** - Doesn't verify payment status with Square API
5. **Hardcoded credentials** - API keys in code
6. **Single line item** - All fees combined into one line item
7. **No partial payments via Square** - Partial payments only work for manual recording

## Security Considerations

The legacy code exposes:
- Access token directly in PHP code (should be in env)
- No CSRF protection visible in payment forms
- No verification that Square actually received payment before marking as paid

## Key Takeaways for New Implementation

1. Use Square's Payment Links API for hosted checkout
2. Implement webhooks for reliable payment confirmation
3. Store API credentials in environment variables
4. Use idempotency keys for all payment requests
5. Verify payment status before updating database
6. Consider using Square's Web Payments SDK for embedded checkout
7. Implement proper error handling and logging
