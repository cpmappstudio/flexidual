---
title: Roles and Permissions
description: Implement Role-Based Access Control (RBAC) in your application. Set
  custom Roles, assign privileges, and control access to resources using Clerk
  Organizations.
metadata:
  title: B2B/B2C Roles and Permissions with Clerk Organizations
lastUpdated: 2026-01-22T06:00:59.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/control-access/roles-and-permissions
sourceFile: /docs/guides/organizations/control-access/roles-and-permissions.mdx
---

> \[!WARNING]
> This feature requires a [paid plan](/pricing){{ target: '_blank' }} for production use, but all features are free to use in development mode so that you can try out what works for you. See the [pricing](/pricing){{ target: '_blank' }} page for more information.

Roles and Permissions let you control who can access specific resources and perform certain actions within each Organization. Clerk provides two default Roles - **admin** and **member** - that cover most common use cases. You can also create custom Roles and fine-grained Permissions that fit your application's specific features and team setup.

Roles are made available to Organizations through [Role Sets](/docs/guides/organizations/control-access/role-sets). Each Organization is assigned a Role Set that determines which Roles can be assigned to its members.

## Roles

Each Role defines what users can do and access within an Organization. You can extend a Role's capabilities by adding [Permissions](#permissions).

### Default Roles

When users create or join Organizations, they need to be assigned a Role. These settings determine which Roles are automatically assigned in different scenarios, whether someone is creating a new Organization or joining an existing one.

For each instance, there are currently two default Roles:

* **Admin (`org:admin`)** - Offers full access to Organization resources. Members with the admin Role have all of the [System Permissions](#system-permissions). They can fully manage the Organization and Organization memberships.
* **Member (`org:member`)** - Offers limited access to Organization resources. Access to Organization resources is limited to the "Read members" and "Read billing" Permissions only, by default. They cannot manage the Organization and Organization memberships, but they can view information about other members in it.

### The **Creator** Role

When a user creates a new Organization, Clerk automatically adds them as its first member and assigns them the Organization's designated **Creator** Role. By default, that Role is `org:admin`.

You cannot delete an Organization Role if it's used as the Organization's **Creator** Role. But, you *can* reassign the **Creator** Role to any other Role with the right Permissions. For example, if you want to delete the `admin` Role, you will have to assign another Role as the **Creator** Role.

The **Creator** Role must *at least* have the following [System Permissions](#system-permissions):

* Manage members (`org:sys_memberships:manage`)
* Read members (`org:sys_memberships:read`)
* Delete Organization (`org:sys_profile:delete`)

To reassign the **Creator** Role:

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. [Create a new Role](#custom-roles) or use an existing Role from the list.
3. Ensure that **Manage members**, **Read members**, and **Delete Organization** System Permissions are selected for the Role.
4. Open the three dots icon for the Role.
5. From the dropdown, select the **Set as Creator role** option.

### The **Default** Role for members

New Organization members are initially assigned the **Default** Role. By default, that Role is `org:member`. This Role is used as a pre-filled default in `<OrganizationProfile />` invitations and for Organization enrollment with [Verified Domains](/docs/guides/organizations/add-members/verified-domains).

You cannot delete an Organization Role if it's used as the Organization's **Default** Role. But, you *can* reassign the **Default** Role to any other Role.

To reassign the **Default** Role:

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. [Create a new Role](#custom-roles) or use an existing Role from the list.
3. Select the three dots next to the Role you want to set as default.
4. From the dropdown, select the **Set as Default role** option.

### Custom Roles

You can create up to 10 custom Organization Roles per application instance to meet your application needs. If you need more than 10 Roles, [contact support](/contact/support){{ target: '_blank' }}.

Custom Roles can be granted Permissions and access. For example, you can create a new Role of **Billing** (`org:billing`) which can be used to group users who belong to a specific department of the Organization and have permission to manage credit card information, invoices, and other resources related to billing.

To create a new Role:

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. Select the **All roles** tab.
3. Select **Add role**.
4. Give the Role a name, a key to reference it by, and a description. The final key will follow the format `org:<role>`.
5. Select whether you want to include the role in the default Role Set.
6. Select **Save**.

> \[!NOTE]
> You must add the Role to a Role Set before members can be assigned this role. Refer to [Role Sets](/docs/guides/organizations/control-access/role-sets) to learn more about controlling role availability.

### Change a user's Role

You can change a user's Role in the Clerk Dashboard or in your application using the <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> component.

> \[!NOTE]
> The Roles available in the dropdown are limited to those included in the Organization's assigned [Role Set](/docs/guides/organizations/control-access/role-sets). If you need to assign a Role that's not available, you'll need to add that Role to the Organization's Role Set.

To change a user's Role in the Clerk Dashboard:

1. In the Clerk Dashboard, select [**Organizations**](https://dashboard.clerk.com/~/organizations) and select an organization.
2. Select the **Members** tab.
3. In the list of members, find the one whose Role you want to change.
4. Select another Role from their Role dropdown.

### Delete a Role

You cannot delete a Role that is still assigned to members of an Organization. Change the members to a different Role before completing the following steps.

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. Select the **All roles** tab.
3. Select the three dots icon next to the Role.
4. Select **Delete role**.

> \[!NOTE]
> You cannot delete any Roles currently assigned to one or more Organization members. If any Organization members currently have this Role, you'll need to reassign them first. Refer to [Role Sets](/docs/guides/organizations/control-access/role-sets) for more information.

## Permissions

Permissions grant users privileged access to resources and operations, like creating and deleting. Clerk supports two types of Permissions: **System Permissions** and **Custom Permissions**.

### System Permissions

Clerk provides a set of System Permissions that power [Clerk's Frontend API](/docs/reference/frontend-api){{ target: '_blank' }} and <SDKLink href="/docs/:sdk:/reference/components/overview" sdks={["react","nextjs","js-frontend","chrome-extension","expo","expressjs","fastify","react-router","remix","tanstack-react-start","go","astro","nuxt","vue","ruby","js-backend"]}>organization-related Clerk components</SDKLink>. These Permissions serve as the baseline required for Clerk to operate effectively.

Clerk's System Permissions consist of the following:

* Manage Organization (`org:sys_profile:manage`)
* Delete Organization (`org:sys_profile:delete`)
* Read members (`org:sys_memberships:read`)
* Manage members (`org:sys_memberships:manage`)
* Read domains (`org:sys_domains:read`)
* Manage domains (`org:sys_domains:manage`)
* Read billing (`org:sys_billing:read`)
* Manage billing (`org:sys_billing:manage`)

You can assign these System Permissions to any Role.

> \[!WARNING]
> System Permissions aren't included in [session claims](/docs/guides/sessions/session-tokens#default-claims). If you need to check Permissions on the server-side, you must [create Custom Permissions](#custom-permissions) for authorization checks in your application code.

### Custom Permissions

Custom Permissions let you define fine-tuned access control within your Organization. Each Permission is tied to a Feature, and can be assigned to one or more Roles. To create a Custom Permission, you must first create a Role (e.g. **sales**) and a Feature within that Role (e.g. **invoices**). Once both exist, you can define specific Permissions (e.g. **create**) related to that Feature. To assign a Custom Permission to a user, you must assign the user to the Role that has the Permission.

To create a new Permission:

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. [Create a new Role](#custom-roles) or use an existing Role from the list.
3. Under **Custom permissions**, select **Create permission** under the Feature you want to create the Permission for. If there are no Features, you'll need to create a new one first. Select **Create feature** and fill in the required fields. Once finished, the newly created Feature will appear in the list, and the **Create permission** button will appear.
4. Give the Permission a name, a key to reference it by, and a description. The final key will follow the format `org:<feature>:<permission>`.
   > \[!NOTE]
   > Common Permission values could be:
   >
   > * `create` — to allow creating resources
   > * `read` — to allow reading/viewing resources
   > * `update/manage` — to allow updating/editing resources
   > * `delete` — to allow deleting resources
   >
   > For example, you could create a new Permission called **Create invoices** (`org:invoices:create`) which allows only users with this Permission to edit invoices. Then, you could assign this Permission to a Role, or multiple Roles, such as **Billing** (`org:billing`) or **Sales** (`org:sales`).
5. Select **Create permission**.

You can also create a Custom Permission by navigating to the [**Features**](https://dashboard.clerk.com/~/features) tab in the Clerk Dashboard.

## Verify a user's Role or Permission

It's best practice to always verify whether or not a user is **authorized** to access sensitive information, important content, or exclusive features. **Authorization** is the process of determining the access rights and privileges of a user, ensuring they have the necessary Permissions to perform specific actions. To perform authorization checks using a user's Role or Permission, see the [guide on authorizing users](/docs/guides/secure/authorization-checks).

## Next steps

Now that you've set up Roles and Permissions, you can:

* [Configure and assign Role Sets](/docs/guides/organizations/control-access/role-sets) to control which Roles are available to specific Organizations
* [Perform authorization checks](/docs/guides/secure/authorization-checks) to limit access to content or entire routes based on a user's Role or Permissions
* [Learn how to automatically invite users to an Organization based on their email domain](/docs/guides/organizations/add-members/verified-domains)
* [Learn how to manually invite users to an Organization](/docs/guides/organizations/add-members/invitations)
* [Learn how to automatically add users to an Organization through Enterprise SSO](/docs/guides/organizations/add-members/sso)


---
title: Role Sets
description: Control which Roles are available to each Organization using Role
  Sets, the foundational building block for organization-level access control.
lastUpdated: 2026-01-22T06:00:59.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/control-access/role-sets
sourceFile: /docs/guides/organizations/control-access/role-sets.mdx
---

> \[!WARNING]
> This feature requires a [paid plan](/pricing){{ target: '_blank' }} for production use, but all features are free to use in development mode so that you can try out what works for you. See the [pricing](/pricing){{ target: '_blank' }} page for more information.

Role Sets are collections of available [Roles](/docs/guides/organizations/control-access/roles-and-permissions) you can assign to members in an Organization. This lets you control role availability on a per-organization basis - if a Role isn't in an Organization's Role Set, members of that Organization can't be assigned to that Role.

When you create an Organization, it's automatically assigned to the **Default Role Set**. By default, this is set to Clerk's **Primary Role Set**, which includes the `admin` and `member` Roles. The Primary Role Set is free and can be modified to fit your needs. To create additional Role Sets with different combinations of Roles, you'll need the [**Enhanced Organizations** add-on](https://clerk.com/pricing).

When you modify a Role Set, the changes are automatically applied to all Organizations using it. This makes it easy to roll out new Roles across multiple Organizations at once.

## When to use Role Sets

Use Role Sets when different Organizations need different available Roles. This works well for:

* **Different pricing tiers** - Your Free plan offers only `admin` and `member`, Pro adds `moderator` and `analyst`, and Enterprise adds `security_admin` and `compliance_officer`.
* **Different customer cohorts** - Small practices get `physician` and `nurse`, while large hospitals also get `department_head` and `specialist`. All cohorts share `admin` and `member`, but get additional Roles specific to their size.

If all Organizations need the same custom Roles, just modify the Primary Role Set instead. Refer to [Roles and Permissions](/docs/guides/organizations/control-access/roles-and-permissions) to learn how.

## Primary Role Set

The **Primary Role Set** is Clerk's default Role Set. It includes:

* **Admin (`org:admin`)** - Full access to Organization resources and management
* **Member (`org:member`)** - Limited access to Organization resources

You can add or remove Roles from it. If you remove a Role that members have, you'll go through the [remapping flow](#remapping-flow).

## Default Role Set

The **Default Role Set** determines which Role Set is automatically assigned to new Organizations. By default, this is configured to use the Primary Role Set, but you can change it to any other Role Set you've created.

To configure the Default Role Set:

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. Select the three dots next to the Role Set you want to set as default.
3. From the dropdown, select the **Set as default role set** option.
4. Confirm your changes.

> \[!NOTE]
> This only affects new Organizations. Existing Organizations keep their current Role Set unless you manually change them.

## Create a Role Set

To create additional Role Sets beyond the Primary Role Set, you'll need the [**Enhanced Organizations** add-on](https://clerk.com/pricing).

To create a Role Set:

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. Select **Create role set**.
3. Give the Role Set a name, a key to reference it by, and a description.
4. Under **Roles**, click **Add Roles**. You can select from a list of global Roles or create new ones. You must also select a **Organization creator role** and a **New member default role**.
5. Select **Save**.

## Assign a Role Set to an Organization

You can assign a different Role Set to an organization to change which Roles are available to its members.

To assign a Role Set:

1. Navigate to [**Organizations**](https://dashboard.clerk.com/~/organizations) in the Clerk Dashboard and select an Organization.
2. Select the **Settings** tab.
3. Under **Roles**, you'll see the current Role Set (the Primary Role Set by default).
4. Choose a new Role Set from the dropdown.
5. If members have Roles that don't exist in the new set, you'll go through the [remapping flow](#remapping-flow).
6. Select **Confirm**.

## Edit a Role Set

When you edit a Role Set, the changes are automatically applied to all Organizations using it.

To edit a Role Set:

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. Select the Role Set you want to edit.

To add Roles, click **Add Roles**. You can select from a list of global Roles or create new ones. You must also select a **Organization creator role** and a **New member default role**.

To remove Roles, click on the three dots next to a Role and select **Remove role**. Confirm this change by typing the role name and clicking **Next**. If you remove a Role that members have, you will go through the [remapping flow](#remapping-flow). If you delete a default Role, the reassigned Role will be the new default Role.

> \[!WARNING]
> Removing a Role affects **all Organizations** using that Role Set. To remove a Role from just one Organization, create a new Role Set for it instead.

## Delete a Role Set

To delete a Role Set:

1. In the Clerk Dashboard, navigate to [**Roles & Permissions**](https://dashboard.clerk.com/~/organizations-settings/roles).
2. Select the **Role sets** tab.
3. Select the three dots next to the Role Set.
4. Select **Delete role set**.
5. If Organizations are using this Role Set, you'll be prompted to select a replacement Role Set for them. You will go through the [remapping flow](#remapping-flow).
6. Confirm by typing the Role Set key.

## Remapping flow

If you modify a Role that members have, you'll be prompted to select a replacement Role. This happens when you:

* Change an Organization's Role Set to one that doesn't include all current Roles.
* Remove a Role from a Role Set that members have.
* Delete a Role Set assigned to an Organization. Once you select a replacement Role Set, Clerk will prompt you to select replacement Roles.

**Example:**

Your Organization uses the "Basic Role Set" with `admin`, `member`, and `viewer`. You switch to the "Advanced Role Set" with `admin`, `member`, `moderator`, and `analyst`.

Since `viewer` doesn't exist in Advanced, you need to remap those members:

1. Select which Role they should receive (e.g., `member`).
2. Click **Remap roles** to confirm and Clerk will remap `viewer` members to `members`.

## Next steps

Now that you've learned about Role Sets, you can:

* [Create Roles and Permissions](/docs/guides/organizations/control-access/roles-and-permissions) to include in Role Sets
* [Check access](/docs/guides/organizations/control-access/check-access) based on Roles and Permissions
* [Invite members](/docs/guides/organizations/add-members/invitations) to Organizations

---
title: Check Roles and Permissions with Authorization Checks
description: Limit access to content or entire routes based on a user's
  Organization Role or Permissions.
metadata:
  title: Check Roles and Permissions in Organizations
lastUpdated: 2026-01-22T06:00:59.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/control-access/check-access
sourceFile: /docs/guides/organizations/control-access/check-access.mdx
---

Authorization checks are checks you perform in your code to determine the access rights and privileges of a user, ensuring they have the necessary Permissions to perform specific actions or access certain content. These checks are essential for protecting sensitive data, gating premium features, and ensuring users stay within their allowed scope of access.

Within Organizations, authorization checks can be performed by checking a user's Roles or Custom Permissions. Roles like `org:admin` determine a user's level of access within an Organization, while Custom Permissions like `org:invoices:create` provide fine-grained control over specific features and actions.

## Examples

For examples on how to perform authorization checks, see the [guide on authorization checks](/docs/guides/secure/authorization-checks).

<Tabs items={['Client-side', 'Server-side']}>
  <Tab>
    You can protect content and even entire routes based on Organization membership, Roles, and Permissions by performing <Tooltip><TooltipTrigger>authorization checks</TooltipTrigger><TooltipContent>Authorization checks are checks you perform in your code to determine the access rights and privileges of a user, ensuring they have the necessary permissions to perform specific actions or access certain content. Learn more about [authorization checks](/docs/guides/secure/authorization-checks).</TooltipContent></Tooltip>.

    In the following example, the page is restricted to authenticated users, users who have the `org:admin` Role, and users who belong to the `Acme Corp` Organization.

    * The <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>Auth</SDKLink> object is used to access the `isSignedIn` property and `has()` method.
    * The `isSignedIn` property is used to check if the user is signed in.
    * The `has()` method is used to check if the user has the `org:admin` Role.
    * The <SDKLink href="/docs/:sdk:/reference/hooks/use-organization" sdks={["chrome-extension","expo","nextjs","react","react-router","remix","tanstack-react-start"]} code={true}>useOrganization()</SDKLink> hook is used to access the organization data.
    * The Organization name is checked to ensure it matches the required Organization name. If a user is not in the required Organization, the page will display a message and the <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> component will be rendered to allow the user to switch to the required Organization.

    ```tsx {{ filename: 'app/protected/page.tsx' }}
    'use client'
    import { OrganizationSwitcher, useAuth, useOrganization } from '@clerk/nextjs'

    export default function Page() {
      // The `useAuth()` hook gives you access to properties like `isSignedIn` and `has()`
      const { isSignedIn, has } = useAuth()
      const { organization } = useOrganization()

      // Check if the user is authenticated
      if (!isSignedIn) {
        return <p>You must be signed in to access this page.</p>
      }

      // Check if there is an Active Organization
      if (!organization) {
        return (
          <>
            <p>Set an Active Organization to access this page.</p>
            <OrganizationSwitcher />
          </>
        )
      }

      // Check if the user has the `org:admin` Role
      if (!has({ role: 'org:admin' })) {
        return <p>You must be an admin to access this page.</p>
      }

      // Check if Organization name matches (e.g., "Acme Corp")
      const requiredOrgName = 'Acme Corp'
      if (organization.name !== requiredOrgName) {
        return (
          <>
            <p>
              This page is only accessible in the <strong>{requiredOrgName}</strong> Organization.
              Switch to the <strong>{requiredOrgName}</strong> Organization to access this page.
            </p>
            <OrganizationSwitcher />
          </>
        )
      }

      return (
        <p>
          You are currently signed in as an <strong>admin</strong> in the{' '}
          <strong>{organization.name}</strong> Organization.
        </p>
      )
    }
    ```

    For more examples on how to perform authorization checks, see the [dedicated guide](/docs/guides/secure/authorization-checks).
  </Tab>

  <Tab>
    You can protect content and even entire routes based on Organization membership, Roles, and Permissions by performing <Tooltip><TooltipTrigger>authorization checks</TooltipTrigger><TooltipContent>Authorization checks are checks you perform in your code to determine the access rights and privileges of a user, ensuring they have the necessary permissions to perform specific actions or access certain content. Learn more about [authorization checks](/docs/guides/secure/authorization-checks).</TooltipContent></Tooltip>.

    In the following example, the page is restricted to authenticated users, users who have the `org:admin` Role, and users who belong to the `Acme Corp` Organization.

    * The <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>Auth</SDKLink> object is used to access the `isAuthenticated` and `orgId` properties, as well as the `has()` method.
    * The `isAuthenticated` property is used to check if the user is authenticated.
    * The `orgId` property is used to check if there is an Active Organization.
    * The `has()` method is used to check if the user has the `org:admin` Role.
    * To fetch the Organization server-side, the <SDKLink href="/docs/reference/nextjs/overview#clerk-client" sdks={["nextjs"]} code={true}>clerkClient()</SDKLink> helper is used to access the <SDKLink href="/docs/reference/backend/organization/get-organization" sdks={["js-backend"]} code={true}>getOrganization()</SDKLink> method.
    * The Organization name is checked to ensure it matches the required Organization name. If a user is not in the required Organization, the page will display a message and the <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> component will be rendered to allow the user to switch to the required Organization.

    This example is written for Next.js App Router, but can be adapted to other frameworks by using the appropriate method for accessing the <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>Auth object</SDKLink>, and the appropriate initialization for `clerkClient()`.

    ```tsx {{ filename: 'app/protected/page.tsx' }}
    import { auth, clerkClient } from '@clerk/nextjs/server'
    import { OrganizationSwitcher } from '@clerk/nextjs'

    export default async function Page() {
      // The `Auth` object gives you access to properties like `isAuthenticated` and `userId`
      // Accessing the `Auth` object differs depending on the SDK you're using
      // https://clerk.com/docs/reference/backend/types/auth-object#how-to-access-the-auth-object
      const { isAuthenticated, orgId, has } = await auth()

      // Check if the user is authenticated
      if (!isAuthenticated) {
        return <p>You must be signed in to access this page.</p>
      }

      // Check if there is an Active Organization
      if (!orgId) {
        return (
          <>
            <p>Set an Active Organization to access this page.</p>
            <OrganizationSwitcher />
          </>
        )
      }

      // Check if the user has the `org:admin` Role
      if (!has({ role: 'org:admin' })) {
        return <p>You must be an admin to access this page.</p>
      }

      // To fetch the Active Organization server-side,
      // first initialize the JS Backend SDK.
      // This varies depending on the SDK you're using
      // https://clerk.com/docs/js-backend/getting-started/quickstart
      // Then use the `clerkClient()` to access the `getOrganization()` method
      const client = await clerkClient()
      const organization = await client.organizations.getOrganization({ organizationId: orgId })

      // Check if Organization name matches (e.g., "Acme Corp")
      const requiredOrgName = 'Acme Corp'
      if (organization.name !== requiredOrgName) {
        return (
          <>
            <p>
              This page is only accessible in the <strong>{requiredOrgName}</strong> Organization.
              Switch to the <strong>{requiredOrgName}</strong> Organization to access this page.
            </p>
            <OrganizationSwitcher />
          </>
        )
      }

      return (
        <p>
          You are currently signed in as an <strong>admin</strong> in the{' '}
          <strong>{organization.name}</strong> Organization.
        </p>
      )
    }
    ```

    For more examples on how to perform authorization checks, see the [dedicated guide](/docs/guides/secure/authorization-checks).
  </Tab>
</Tabs>

## Next steps

Now that you know how to check Roles and Permissions, you can:

* [Read the complete authorization checks guide](/docs/guides/secure/authorization-checks)
* <SDKLink href="/docs/:sdk:/guides/billing/for-b2b#control-access-with-features-plans-and-permissions" sdks={["nextjs","react","expo","react-router","astro","tanstack-react-start","remix","nuxt","vue","js-frontend","expressjs","fastify","js-backend"]}>Learn how to check Features and Plans</SDKLink> for Subscription-based applications
* [Set up custom Roles and Permissions](/docs/guides/organizations/control-access/roles-and-permissions) to define your access control model
* [Configure default Roles](/docs/guides/organizations/configure#default-roles) for new Organization members
