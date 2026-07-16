---
title: Organizations
description: Learn how to use Clerk Organizations to build scalable B2B auth features, user management, role based access control (RBAC), and per-organization invitation flows into your B2B SaaS.
metadata:
  title: Overview - Build a B2B/B2C multi-tenant SaaS with Clerk Organizations
lastUpdated: 2025-11-21T23:37:11.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/overview
sourceFile: /docs/guides/organizations/overview.mdx
---

Organizations are a flexible and scalable way to manage users and their access to resources within your Clerk application. With organizations, you can assign specific roles and permissions to users, making them useful for managing projects, coordinating teams, or facilitating partnerships.

> \[!NOTE]
> To explore organizations in Clerk, check out the demo apps:
> [https://github.com/clerk/orgs](https://github.com/clerk/orgs)

## Enable organizations in your application

Organizations are disabled by default.

To enable organizations:

1. In the Clerk Dashboard, navigate to the [**Organizations Settings**](https://dashboard.clerk.com/~/organizations-settings) page.
2. Select **Enable Organizations**.

Once organizations are enabled, you will be presented with the default settings, roles, and permissions that are applied to all organizations in that application instance. The following sections will explain these settings in more detail.

## Roles and permissions

Roles determine a user's level of access and permissions within an organization. Learn more about [how roles and permissions work and how to create your own with Clerk](/docs/guides/organizations/roles-and-permissions).

## Membership limit

There is no limit to the number of organizations a user can be a member of.

However, there is a limit to how many total members can be in a single organization. By default, the membership limit is set to 5 members. To change this limit, scroll to the **Default membership limit** section and update the membership limit.

If you are on the Free plan, you can update the membership limit to a maximum of 5 members.

If you have the Pro plan, you can set the membership limit to unlimited.

You can also change this limit on a per-organization basis:

1. In the top in the Clerk Dashboard, select [**Organizations**](https://dashboard.clerk.com/~/organizations).
2. Select the organization you want to update.
3. In the **Membership limit** section, update the membership limit. Note that this will not apply to organizations that already exist.

## Allow new members to delete organizations

By default, organizations are deletable. Any member with the "Delete organization" permission can delete an organization. To prevent organizations from being deleted, you can disable the ability to delete organizations by following these steps:

1. In the Clerk Dashboard, navigate to the [**Organizations Settings**](https://dashboard.clerk.com/~/organizations-settings) page.
2. Disable **Allow new members to delete organizations**. Note that this will not apply to organizations that already exist.

## Verified domains

Verified domains can be used to streamline enrollment into an organization. For example, if the domain `@clerk.com` is added to an organization, any user with a `@clerk.com` email address can be automatically invited or be suggested to join this organization. This feature is useful for organizations that want to restrict membership to users with specific email domains. See the [guide on verified domains](/docs/guides/organizations/verified-domains) for more information.

## Allow Personal Accounts

In the Clerk Dashboard, there are two types of workspaces:

* **Personal account**: A Personal Account/workspace is a user's unique, individual space, independent of any organization.
* **Organization workspace**: An organization workspace is owned and managed by an organization, which can have multiple members, also known as collaborators. The organization workspace that a user is currently viewing is called the <Tooltip><TooltipTrigger>Active Organization</TooltipTrigger><TooltipContent>A user can be a member of multiple Organizations, but only one can be active at a time. The **Active Organization** determines which Organization-specific data the user can access and which Role and related Permissions they have within the Organization.</TooltipContent></Tooltip>.

Most multi-tenant applications want every user to be part of an organization rather than operating in an isolated Personal Account. Accordingly, **Personal Accounts are disabled by default** once you enable organizations. After signing up, [a user must create or join an organization before they can proceed](/docs/guides/configure/session-tasks).

To enable Personal Accounts for your application, toggle **Allow Personal Accounts** in the [**Organizations Settings**](https://dashboard.clerk.com/~/organizations-settings) page.

> \[!IMPORTANT]
> Personal accounts being disabled by default was released on August 22, 2025. Applications created before this date will not be able to see the **Allow Personal Accounts** setting, because Personal Account were enabled by default.

## Organization slugs

Organization slugs are human-readable URL identifiers that help users reference which organization they're working in.

To enable it, navigate to the [**Organizations Settings**](https://dashboard.clerk.com/~/organizations-settings) page in the Clerk Dashboard.

When enabled, organization slugs will be displayed in the <SDKLink href="/docs/:sdk:/reference/components/organization/create-organization" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<CreateOrganization /></SDKLink>, <SDKLink href="/docs/:sdk:/reference/components/organization/organization-list" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationList /></SDKLink>, and <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> components.

> \[!IMPORTANT]
> Organization slugs are disabled by default for applications created after October 7, 2025. For applications created before this date, you can opt to disable it.

## Active organization

When a user is a member of an organization, they can switch between different organizations. The organization workspace that a user is currently viewing is called the **Active Organization**. The Active Organization determines which organization-specific data the user can access and which role and related permissions they have within the organization.

When Personal Accounts are disabled (the default), users must select or create an organization to continue. This is handled automatically in the [session tasks flow](/docs/guides/configure/session-tasks).

When Personal Accounts are enabled, users initially sign in to their Personal Account with **no** Active Organization set. The easiest way to allow users to set an organization as active is to use the <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> component. If the prebuilt components don't meet your specific needs or if you require more control over the logic, you can also use the `setActive()` method, which is returned by the <SDKLink href="/docs/:sdk:/reference/hooks/use-organization-list" sdks={["chrome-extension","expo","nextjs","react","react-router","remix","tanstack-react-start"]} code={true}>useOrganizationList()</SDKLink> hook. If you aren't using hooks, you can access the `setActive()` method from the <SDKLink href="/docs/reference/javascript/clerk#set-active" sdks={["js-frontend"]} code={true}>Clerk</SDKLink> object.

## Monthly Active Organization (MAO)

The number of organizations you can have in a single Clerk application depends on your [Clerk plan](/pricing){{ target: '_blank' }} and the type of instance (development or production), and is measured by Monthly Active Organizations (MAOs). An MAO is an organization with at least two users that have signed in that month, at least one of which must have interacted with the organization during the current billing cycle.

With the Free plan:

* In development instances, you can have *up to* 50 MAOs in a single Clerk application. Each MAO can have *up to* 5 members.
* In production instances, you can have up to 100 MAOs in a single Clerk application. Each MAO can have up to 5 members.

With the Pro plan:

* In development instances, you can have an unlimited number of MAOs in a single Clerk application *for free*. Each MAO can have an unlimited number of members.
* In production instances, you can have up to 100 MAOs in a single Clerk application *for free*. Each MAO after the first 100 costs $1.00 per month. Each MAO can have an unlimited number of members.

For more information on pricing, see the [pricing page](/pricing){{ target: '_blank' }}.

If you need more organizations or custom pricing, contact the [sales team](/contact/sales){{ target: '_blank' }} to upgrade to the Enterprise plan.

## Manage organizations

As the application owner, you have control over all of the organizations within your application - both those created by you and those created by your users. You can create, update, and delete organizations, as well as manage their members and settings.

There are two ways to manage organizations:

* [In the Clerk Dashboard](#manage-organizations-in-the-clerk-dashboard)
* [In your application](#manage-organizations-in-your-application)

### Manage organizations in the Clerk Dashboard

To manage organizations in the Clerk Dashboard:

1. In the top in the Clerk Dashboard, select [**Organizations**](https://dashboard.clerk.com/~/organizations). Here, you can view and manage all organizations in your application.
2. Select a specific organization to view its details, members, invitations, and settings. Here, you can update the organization's name, slug, logo, and public and private metadata. You can also set the organization's [membership limit](#membership-limit).

### Manage organizations in your application

For managing organizations in your application, Clerk provides a set of prebuilt components:

* <SDKLink href="/docs/:sdk:/reference/components/organization/create-organization" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<CreateOrganization /></SDKLink> - A form for a user to create a new organization.
* <SDKLink href="/docs/:sdk:/reference/components/organization/organization-profile" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationProfile /></SDKLink> - A profile page for the user's currently Active Organization.
* <SDKLink href="/docs/:sdk:/reference/components/organization/organization-list" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationList /></SDKLink> - A list of organizations that a user is a member of.
* <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> - A dropdown menu that handles all organization flows. It allows a user to create an organization, switch between organizations, and view their organization's profile, which allows them to manage the organization's settings, invitations, and current members. If [Personal Accounts are enabled](/docs/guides/organizations/overview#allow-personal-accounts), users can also switch to their Personal Account.

If the prebuilt components don't meet your specific needs or if you require more control over the logic, you can rebuild and customize the existing Clerk flows using the Clerk API. See the [custom flows](/docs/guides/development/custom-flows/overview) for more information.

## Create an organization

There are two ways to create an organization:

* [In the Clerk Dashboard](#create-an-organization-in-the-clerk-dashboard)
* [In your application](#create-an-organization-in-your-application)

How many organizations you can create depends on how many [MAOs](#monthly-active-organization-mao) you have.

### Create an organization in the Clerk Dashboard

To create an organization in the Clerk Dashboard:

1. In the top in the Clerk Dashboard, select [**Organizations**](https://dashboard.clerk.com/~/organizations).
2. Select the **Create Organization** button.
3. Enter the organization's name. Optionally, upload the organization's logo, enter the organization's slug, and select the organization's owner. The slug is a unique identifier for the organization that is used in URLs, such as `example-name`.

### Create an organization in your application

By default, users have the permission to create organizations within your application. To configure this permission for all users:

1. In the Clerk Dashboard, navigate to the [**Organizations Settings**](https://dashboard.clerk.com/~/organizations-settings) page.
2. At the bottom of the page, in the **Limit creation** section, enable/disable **Allow new users to create organizations**. You can also configure the number of organizations that can be created by each user. By default, each user can create an unlimited number of organizations.

If you want to only configure this permission for a specific user, you can override it on a per-user basis on the user's profile page in the Clerk Dashboard:

1. In the top in the Clerk Dashboard, select [**Users**](https://dashboard.clerk.com/~/users).
2. Select the user you want to update.
3. In the **User permissions** section, enable/disable **Allow user to create organizations**.

When a user creates an organization, they become the organization's admin. As the organization's admin, they have full control over the organization, including the ability to update the organization's settings, invite users to join the organization, and manage the organization's members.

A single user within one of your applications can create *up to* 100 organizations in that application. If you need users to be able to create more organizations than this, [contact support](/contact/support){{ target: '_blank' }} to have the limit raised.

The easiest way to allow users to create organizations is to use the <SDKLink href="/docs/:sdk:/reference/components/organization/create-organization" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<CreateOrganization /></SDKLink> and/or <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> components. The `<OrganizationSwitcher />` component is more comprehensive, as it handles all organization flows.

## Organization invitations

[Learn how to create and revoke organization invitations](/docs/guides/organizations/invitations).

## Manage enterprise connections

Single Sign-On (SSO) can be configured at the organization level, allowing organizations to use their own Identity Provider (IdP) for authentication. These are called **enterprise connections**. When configured:

* Users can sign in through their organization's configured IdP
* Users are **automatically added as members** of the organization upon successful authentication
* Organizations can maintain their existing identity management workflows
* SAML 2.0 and OIDC protocols are supported

For instructions on how to set up and manage SSO for your organizations, see the [dedicated guide](/docs/guides/organizations/sso).

## Next steps

* [Learn how to limit access to content or entire routes based on a user's role or permissions](/docs/guides/secure/authorization-checks)
* [Learn how to restrict memberships to an organization based on their email domain](/docs/guides/organizations/verified-domains)
* [Learn how to manually invite users to an organization](/docs/guides/organizations/invitations)
* [Learn how to automatically add users to an organization based on their email domain](/docs/guides/organizations/sso)
