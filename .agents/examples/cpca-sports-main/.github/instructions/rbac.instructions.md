---
applyTo: "**/lib/auth/**,**/middleware.ts,**/proxy.ts"
---

# Role-Based Access Control (RBAC)

This project uses **Clerk Organizations** for role-based access control. Roles and permissions are managed in the Clerk Dashboard, not in code.

## Architecture

| Concept | Implementation |
|---------|----------------|
| Organization | Clerk Organization |
| Roles | Defined in Clerk Dashboard |
| Permissions | Granular permissions in Clerk Dashboard |
| SuperAdmin | User metadata flag (`isSuperAdmin: true`) |

## Roles

| Role | Key | Description |
|------|-----|-------------|
| SuperAdmin | Platform-level (user metadata) | Creates organizations, manages platform |
| Admin | `org:admin` | Full access to organization |
| Accountant | `org:accountant` | Manages fees, payments, financial reports |
| Member | `org:member` | Registered user, views own data and makes payments |

## Clerk Dashboard Setup

### 1. Enable Organizations

1. Go to **Clerk Dashboard** → **Organizations Settings**
2. Enable **Organizations**
3. Enable **Organization Slugs**
4. Disable **Allow Personal Accounts** (users must belong to an organization)

### 2. Define Custom Roles

Navigate to **Organizations Settings** → **Roles** and create:

| Role | Key | Description |
|------|-----|-------------|
| Admin | `org:admin` | Full organization access |
| Accountant | `org:accountant` | Financial management access |
| Member | `org:member` | Basic member access (built-in) |

### 3. Define Permissions

Navigate to **Organizations Settings** → **Permissions** and create:

| Permission | Key | Used for |
|------------|-----|----------|
| Read offerings | `org:offerings:read` | View offerings |
| Manage offerings | `org:offerings:manage` | Create/edit offerings |
| Read applications | `org:applications:read` | View applications |
| Manage applications | `org:applications:manage` | Review/approve applications |
| Read members | `org:members:read` | View members list |
| Manage members | `org:members:manage` | Add/remove members |
| Read fees | `org:fees:read` | View fees and assignments |
| Manage fees | `org:fees:manage` | Create/edit fee templates and assignments |
| Read forms | `org:forms:read` | View form templates |
| Manage forms | `org:forms:manage` | Create/edit form templates |
| Read staff | `org:staff:read` | View staff members |
| Manage staff | `org:staff:manage` | Add/remove staff |
| Read payments | `org:payments:read` | View payment history |
| Manage payments | `org:payments:manage` | Register cash payments, process refunds |
| Manage settings | `org:settings:manage` | Edit organization settings |

### 4. Assign Permissions to Roles

| Role | Permissions |
|------|-------------|
| Admin | All permissions |
| Accountant | `org:members:read`, `org:fees:read`, `org:fees:manage`, `org:payments:read`, `org:payments:manage` |
| Member | `org:offerings:read` (own data only) |

### 5. Configure SuperAdmin

SuperAdmin is a platform-level role, not organization-level. Configure via user metadata:

1. Go to **Users** → Select user
2. Edit **Public Metadata**
3. Add: `{ "isSuperAdmin": true }`

Configure session token to expose metadata:

1. Go to **Sessions** → **Customize session token**
2. Add:

```json
{
  "metadata": "{{user.public_metadata}}"
}
```

## Usage in Code

### Protect Routes in Middleware

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isOrgRoute = createRouteMatcher(["/:org(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { sessionClaims } = await auth();
  
  // SuperAdmin routes (platform level)
  if (isAdminRoute(req)) {
    if (!sessionClaims?.metadata?.isSuperAdmin) {
      return new Response("Forbidden", { status: 403 });
    }
  }
  
  // Organization routes require authentication
  if (isOrgRoute(req)) {
    await auth.protect();
  }
});
```

### Protect Pages with Permissions

```typescript
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

export default async function FeesPage() {
  const { has } = await auth();
  
  if (!has({ permission: "org:fees:read" })) {
    notFound();
  }
  
  return <FeesList />;
}
```

### Check Permissions in Components

```typescript
import { auth } from "@clerk/nextjs/server";

export default async function ManagePaymentsButton() {
  const { has } = await auth();
  
  // Only show for admin and accountant
  if (!has({ permission: "org:payments:manage" })) {
    return null;
  }
  
  return <Button>Register Cash Payment</Button>;
}
```

### Check SuperAdmin Status

```typescript
import { isSuperAdmin } from "@/lib/auth/auth";
import { auth } from "@clerk/nextjs/server";

export default async function PlatformAdminPage() {
  const authObject = await auth();
  
  if (!isSuperAdmin(authObject)) {
    notFound();
  }
  
  return <OrganizationsList />;
}
```

## Helper Functions

Located in `lib/auth/auth.ts`:

```typescript
import type { auth } from "@clerk/nextjs/server";

export type Auth = Awaited<ReturnType<typeof auth>>;

export function isSuperAdmin(authObject: Auth): boolean {
  const metadata = authObject.sessionClaims?.metadata as
    | { isSuperAdmin?: boolean }
    | undefined;
  return metadata?.isSuperAdmin === true;
}

export function getActiveOrgSlug(authObject: Auth): string | null {
  return authObject.orgSlug ?? null;
}

export function getActiveOrgRole(authObject: Auth): string | null {
  return authObject.orgRole ?? null;
}
```

## Access Control Matrix

| Feature | SuperAdmin | Admin | Accountant | Member |
|---------|------------|-------|------------|--------|
| Create organizations | Yes | - | - | - |
| Manage offerings | Yes | Yes | - | - |
| Review applications | Yes | Yes | - | - |
| Manage staff | Yes | Yes | - | - |
| Manage forms | Yes | Yes | - | - |
| View members | Yes | Yes | Yes | Own only |
| Manage fees | Yes | Yes | Yes | - |
| View payments | Yes | Yes | Yes | Own only |
| Register cash payments | Yes | Yes | Yes | - |
| Make online payments | - | - | - | Yes |
| Manage settings | Yes | Yes | - | - |

## Key Points

1. **No custom role types in code** - Roles are defined in Clerk Dashboard
2. **Use `has()` for permission checks** - Not custom role checking
3. **Use `auth.protect()` in middleware** - For route protection
4. **SuperAdmin is special** - Uses user metadata, not org roles
5. **Sync to Convex via webhooks** - For backend authorization

## Convex Integration

Roles need to be synced to Convex for backend authorization:

1. Set up Clerk webhook for `organizationMembership.*` events
2. Update `roleAssignments` table in Convex
3. Query local data in Convex functions

See `convex/http.ts` for webhook handling.