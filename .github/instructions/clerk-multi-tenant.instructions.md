---
title: Multi-tenant architecture
description: This guide outlines a number of the common architecture scenarios for building B2B, B2C, and Platform applications with Clerk, their characteristics, and limitations.
lastUpdated: 2025-11-21T23:37:11.000Z
sdkScoped: "false"
canonical: /docs/guides/how-clerk-works/multi-tenant-architecture
sourceFile: /docs/guides/how-clerk-works/multi-tenant-architecture.mdx
---

There are several ways to model how users and Organizations fit into your application. The 3 scenarios that will be covered in this guide are:

1. B2C: Business to Consumer
2. B2B: Business to Business
3. Platforms

We will share some of the common characteristics of apps in each scenario as well as the level of support for these features in Clerk.

## B2C: Business to Consumer

B2C companies focus on selling products or services directly to consumers. Some popular examples are Netflix, Headspace, and Spotify. Clerk supports the B2C user management model out-of-the-box, with little-to-no configuration.

In a B2C scenario, applications generally share the following characteristics:

* A user creates a single account with your service
* There is a single, shared user-pool which all the users belong to
* Any connections enabled for your application are available to all users to authenticate with
* The application branding is that of your company (as in, not white-labelled per customer or organization)
* The application is accessible under a single domain (for example: `example.com` or `app.example.com`)

> \[!NOTE]
> In the B2C scenario, Organizations are generally not necessary since users that sign up to your application typically do not exist as part of a team, organization, or workspace.

## B2B: Business to Business

B2B companies sell to other businesses. Some examples include: GitHub, Vercel, Salesforce, Sentry, and Clerk.

In the B2B model, multi-tenant SaaS applications generally leverage organizations (sometimes called teams or workspaces) to manage users and their memberships. This approach allows for control over what resources users have access to across different organizations based on their Roles.

Oftentimes such applications will also allow users to create Personal Accounts that are separate from other organizations. For example, GitHub allows users to create repositories under their own Personal Account or an organization they are part of.

The user pool for multi-tenant, SaaS applications will generally fall into one of two categories:

1. **Shared user-pool**: the application has a single pool of users. A user can create one account and belong to multiple organizations. The user can have separate Roles in each Organization.
2. **Isolated user-pool**: each organization has its own pool of users. A user must create a separate account for each organization.

> \[!NOTE]
> Clerk supports the **shared user-pool** model for B2B scenarios which will be discussed in this section. The **isolated user-pool** model is more relevant in the Platforms scenario which will be discussed in the next section.

B2B SaaS applications with the following characteristics are well-supported with Clerk:

* A single application deployment that serves multiple business customers (multi-tenant)
* A shared user-pool model where a user can log in with a single account and belong to multiple organizations
* Enabled connections can be available to all users or linked to specific organizations
* The application may carry your own branding or some elements of your customer's branding
* The application is served from a single domain (for example: `app.example.com`)

### Integrating Organizations with your application

Clerk offers a number of building blocks to help integrate Organizations into your application:

* The <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /> component</SDKLink> provides a way for your users to select which Organization is the <Tooltip><TooltipTrigger>Active Organization</TooltipTrigger><TooltipContent>A user can be a member of multiple Organizations, but only one can be active at a time. The **Active Organization** determines which Organization-specific data the user can access and which Role and related Permissions they have within the Organization.</TooltipContent></Tooltip>. The [`useOrganizationList()` hook](/docs/guides/development/custom-flows/organizations/organization-switcher) can be used for more control.
* The <SDKLink href="/docs/:sdk:/reference/hooks/use-organization" sdks={["chrome-extension","expo","nextjs","react","react-router","remix","tanstack-react-start"]} code={true}>useOrganization() hook</SDKLink> can be used to fetch the <Tooltip><TooltipTrigger>Active Organization</TooltipTrigger><TooltipContent>A user can be a member of multiple Organizations, but only one can be active at a time. The **Active Organization** determines which Organization-specific data the user can access and which Role and related Permissions they have within the Organization.</TooltipContent></Tooltip>.
* The <SDKLink href="/docs/:sdk:/reference/components/control/protect" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue"]} code={true}>\<Protect> component</SDKLink> enables you to limit who can view certain pages based on their role. Additionally, Clerk exposes a number of helper functions, such as <SDKLink href="/docs/reference/nextjs/app-router/auth" sdks={["nextjs"]} code={true}>auth()</SDKLink>, and hooks, such as <SDKLink href="/docs/:sdk:/reference/hooks/use-auth" sdks={["astro","chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>useAuth()</SDKLink>, to check the user's authorization throughout your app and API endpoints.

The Organization's ID should be stored in your database alongside each resource so that it can be used to filter and query the resources that should be rendered or returned according to the <Tooltip><TooltipTrigger>Active Organization</TooltipTrigger><TooltipContent>A user can be a member of multiple Organizations, but only one can be active at a time. The **Active Organization** determines which Organization-specific data the user can access and which Role and related Permissions they have within the Organization.</TooltipContent></Tooltip>.

## Platforms

> \[!NOTE]
> Today, Clerk does not currently support the Platforms scenario. We are working on [Clerk for Platforms](https://feedback.clerk.com/roadmap/3b40265e-d8ae-41b0-a4b3-9c947d460218) to enable developers building platforms to offer their users Clerk's full range of features and customizability.

In the Platforms scenario, businesses can create multiple, isolated applications with their own user pools, branding, security policies, and limits. Some examples in this scenario are e-commerce platforms like Shopify, e-learning platforms, and mortgage lending platforms.

For example, you may be creating an e-learning platform that allows universities to create courses and enroll students. In this case, each customer would be a university who would have their own set of students, professors, and administrators as their users. Additionally, each university would likely have a custom domain (`courses.example.com`) with their branding where their users can authenticate and use the platform.

In the e-learning platform scenario, the users of one university should be completely isolated from another university and each university might have its own set of authentication strategies and security policies.

The following are some of the most commonly requested features for the Platforms scenario (Clerk for Platforms):

* Vanity domains (`customer.example.com`) or a custom domain (`customer.com`) for each of your customers
* Allow your customers to independently customize their branding, including their authentication screens, SMS and email templates
* Isolated user pools such that users from one customer are logically separated from users of another customer
* Independently enforce different limits based on your customer's subscription (for example: limit their number of users they can invite to an organization)
* Enable your customers to independently configure the authentication policies, enabled connections, and MFA policies available to their users



Designing for multiple customers in a single application sounds simple—until it's not.

Multi-tenancy is the process of supporting multiple organizations or customers in a single application. It requires deliberate architectural choices around authentication, authorization, data storage, and performance. As your product grows, so do the expectations around isolation, access control, and performance. Building a solid multi-tenant strategy is the foundation for scale.

In this guide, we’ll walk through the core principles of multi-tenancy, popular database models, authentication flows, and the tools that help you ship a secure, flexible SaaS product faster.

Key Principles of Multi-Tenant Design
Data Isolation
The most important rule of multi-tenancy is this: one tenant should never see another tenant’s data. This is often enforced at the application layer, but can also be enforced at the database level using Postgres's Row-Level Security (RLS) mechanism. Platforms like Supabase and Neon support this natively.

For stricter isolation, such as in compliance-driven industries, some apps take it further by assigning a separate database per tenant—a pattern we’ll explore in more detail shortly.

Auth Separation
In more security-sensitive applications, you may want to isolate not just data but user identity as well. This could mean creating separate user pools per tenant or requiring tenant-specific authentication flows like custom sign-in URLs.

Role Scoping
Once users are inside the app, you still need to control what they can do. Assigning roles and permissions per tenant is critical to ensure users only access the data and functionality they’re entitled to. This is especially important when users can belong to more than one tenant.

Role Based Access Control (RBAC) is a scalable strategy for ensuring users have the right access within a tenant. It dictates that each user has a role that contains all of the permissions they need to perform their duties, and the authorization logic can check which permissions exist for the user before allowing them to perform the desired action on the system.

Shared Infrastructure
Most SaaS products operate on shared infrastructure, where compute, storage, and codebases are reused across tenants. This reduces operational costs and simplifies deployments. However, one downside is that a noisy tenant (one with heavy usage or bad behavior) could affect others if isolation isn't thoughtfully implemented. This is why it's important to have a good understanding of the different database models and how they can be used to isolate data, as well as a good system to monitor and alert on tenant-level performance.

Multi-Tenant Authentication Flows
Making Authentication Tenant-Aware
In a multi-tenant SaaS app, authentication often needs to be aware of which tenant the user is associated with, sometimes before they’ve even signed in. Some tenants may require specific login methods or domain restrictions that your system needs to enforce.

There are a couple of common patterns to handle this:

The system that handles user authentication can preemptively determine which tenant the user belongs to based on their username or domain. For example, if someone signs in with brian@clerk.dev, the system can detect the domain and automatically associate the login with the clerk.dev organization. At Clerk, we call this “verified domains” and it allows new users to sign up with their own domain and automatically be associated with the correct tenant. This makes the experience seamless while maintaining tenant-level security controls.

Another approach is explicit tenant selection, where the user is prompted to select their tenant before authenticating. This can be handled via a subdomain, URL path, or even a dropdown based on past login history. Once selected, your app can enforce tenant-specific auth logic for that session.

Managing Tenant Context for Logged-In Users
If users in your app can belong to more than one organization, you’ll need a way to determine which tenant context they’re operating in at any given time.

This can be tracked using a field on the user account that stores their active tenant, or through a dedicated mapping table in the database that links users to the tenants they belong to along with their associated roles and permissions.

When using JWT-based authentication, details about the active tenant in which the user is operating can be stored in the token claims. When verified, the system can trust the claims and automatically associate the request with that tenant. Clerk’s B2B tools use this approach, storing the user’s active organization and their permissions directly in the token.

This ensures your app knows not just who is logged in—but what they can do and where they are in the multi-tenant hierarchy.

Common Database Patterns
The way you model and isolate tenant data has huge implications for scalability and maintainability. Here are the most common strategies:

Shared DB / Shared Schema
All tenants share the same database and the same table structure. Each record includes a tenant ID to segment the data. This is the easiest setup to manage and makes it straightforward to run queries across tenants—such as for analytics or internal metrics. However, it also introduces a higher risk of accidental data leakage if tenant IDs aren’t properly enforced. Without database-level controls like RLS, you’ll be relying solely on application logic to enforce boundaries.

Multi-tenant database structure diagram
Shared DB / Isolated Schemas
In this model, all tenants share a single database, but each tenant has its own schema. This provides a stronger logical boundary between tenants than a shared schema. You get more security at the database level while still avoiding the overhead of managing many separate databases. That said, you’ll need to apply database changes to every schema, which can be tedious if not automated. Additionally, not all tooling or ORMs support multiple schemas cleanly.

Isolated DB per Tenant
With this approach, each tenant is given a completely separate database. It offers the highest level of isolation and is often required by enterprise customers in regulated industries. This setup allows you to fine-tune performance and resources per tenant. However, it comes with a significant maintenance cost as migrations and schema changes need to be deployed to every database instance. If you are using a shared application layer, you’ll also need a routing mechanism in your application to connect each user to the correct database.

Database per tenant diagram
Hybrid Models
Some SaaS platforms use a mix of the above models. For example, small teams and startups may be placed on a shared schema, while enterprise customers receive isolated databases as part of a premium plan. This hybrid approach gives you the flexibility to scale tenant isolation based on customer needs, without overengineering from day one.

Modeling Tenants in Your Database
Structuring Tables for Multi-Tenant Access
The way you design your tables plays a big role in protecting tenant data. Any table that stores tenant-specific records should include a tenant_id field, and often a created_by_user_id as well. This provides a clear trail of ownership and supports granular permission enforcement.

An example of a tasks table with these attributes would look like this:


CREATE TABLE tasks (
 task_id SERIAL PRIMARY KEY,
 title VARCHAR(255) NOT NULL,
    description TEXT,
 done BOOLEAN DEFAULT FALSE,
 created_by_user_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL
);
You’ll also want a way to track which users belong to which tenants and what roles they have. This can be done with mapping tables that link users to tenants along with their access level. Here is an example of these tables:


-- This table tracks which users
CREATE TABLE user_tenants (
 user_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL
);

-- This would track the role a user has in each tenant
CREATE TABLE user_roles (
 user_id TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,
 tenant_id TEXT NOT NULL
);

-- This table tracks which permissions belong to which role
CREATE TABLE role_permissions (
    role VARCHAR(50) NOT NULL,
 tenant_id TEXT NOT NULL,
 permission_id INT NOT NULL
);

-- This would contain the permission name (ex: tasks.read, tasks.write)
CREATE TABLE permissions (
 permission_id SERIAL PRIMARY KEY,
 permission_name VARCHAR(50) NOT NULL UNIQUE
);
Before allowing any sensitive operation, like writing or deleting data, your app should verify the user's permissions for the active tenant. Whether you do that in application logic or using database-level RLS, this check is key to maintaining secure multi-tenant boundaries.

Associating Requests with the Right Tenant
To properly enforce tenant isolation, every request must be explicitly tied to a tenant. Let’s take a practical look at the two proposed strategies from earlier, using the database structure from the previous section.

Store the active tenant with the user or session record in the database

When storing the user’s active tenant ID in the database, a query to the tasks table returning all tasks for a user actively in the org_1234 tenant would look like this:


SELECT *
  FROM tasks
  WHERE tenant_id = 'org_1234';
Now let’s also consider the permissions a user has when inserting a record into the tasks table. You’d first want to check to make sure the user has a role with the tasks.write permission:


SELECT 1
FROM user_tenants ut
JOIN user_roles ur ON ut.user_id = ur.user_id AND ut.tenant_id = ur.tenant_id
JOIN role_permissions rp ON ur.role = rp.role AND ur.tenant_id = rp.tenant_id
JOIN permissions p ON rp.permission_id = p.permission_id
WHERE ut.user_id = 'user_123'
  AND p.permission_name = 'tasks.write'
  AND ut.tenant_id = 'org_123'
LIMIT 1;
Assuming the above check passes, the following query could then be executed:


INSERT INTO tasks (
 title,
  description,
 done,
 created_by_user_id,
 tenant_id
) VALUES (
  'Task Title',
  'This is the description of the task.',
 FALSE,
  'user_1234',
  'org_1234'
);
Store the active tenant information in the JWT

If you store the user’s role and permissions in the JWT, you will check the values of the verified token claims in code before executing the query. For example, Clerk issues tokens with claims that would look like the following.

Note the organization values in the o claim and the list of permissions stored in the perms claim:


{
  "azp": "http://localhost:3001",
  "exp": 1749142876,
  "fea": "o:articles",
  "fva": [
    2,
    -1
 ],
  "iat": 1749142816,
  "iss": "https://modest-hog-24.clerk.accounts.dev",
  "jti": "106e6c2a3d141e64dbcf",
  "nbf": 1749142806,
  "o": {
    "fpm": "3",
    "id": "org_1234",
    "per": "read,write",
    "rol": "admin",
    "slg": "echoes"
 },
  "perms": [
    "org:tasks:read",
    "org:tasks:write"
 ],
  "pla": "o:free_org",
  "role": "authenticated",
  "sid": "sess_2y66UuWq2epuWYYmMfkkT59SeA7",
  "sub": "user_2s2XJgQ2iQDUAsTBpem9QTu8Zf7",
  "v": 2
}
Note

In this example, perms was added manually into the session claims in the Clerk dashboard.

The following JavaScript example checks for the org:tasks:write permission before inserting a task using the sub claim as the user ID and the o.id as the tenant ID:


const { sessionClaims } = await auth() // Using the Clerk `auth` helper function

if (sessionClaims?.perms.includes('org:tasks:write')) {
  const query = `
 INSERT INTO tasks (title, description, done, created_by_user_id, tenant_id)
 VALUES ($1, $2, $3, $4, $5) RETURNING task_id;
 `

  const values = [title, description, done, sessionClaims.sub, sessionClaims.o.id]

  const res = await client.query(query, values)
}
Tools That Help
Clerk
Clerk is a complete user management solution that integrates seamlessly with multi-tenant apps. Through our B2B toolkit, we support organizations (tenants), verified domains, and fine-grained access control through custom roles and permissions. We also support enterprise authentication flows such as SAML and OIDC, multifactor authentication, and passkeys, and can enforce identity providers on a per-tenant basis.

Database options
Databases are the backbone of tenant isolation. Choosing the right provider and schema strategy impacts not only performance but also how you scale and segment customers.

Supabase is a great choice for shared-database models. It offers built-in Row-Level Security (RLS), letting you enforce per-tenant access at the database layer itself. Because it's built on Postgres, you can use policies, views, and triggers to implement sophisticated tenant-aware queries while still keeping things performant.

Neon provides a compelling model for apps that need stronger isolation. It allows you to spin up isolated branches of a database that can be tied to specific tenants, allowing for independent data storage, migrations, and even teardown if needed. You can pair Neon with Vercel or Supabase for shared frontend and auth infrastructure while maintaining hard tenant boundaries at the data level.

PlanetScale offers horizontal scaling through Vitess and supports schema branches, though its approach to isolation is more opinionated. It works well for global apps with high throughput demands but requires careful planning when implementing tenant-specific patterns.

Automating Tenant Infrastructure with AWS or GCP
For teams adopting a per-tenant infrastructure model, cloud providers like AWS and GCP offer automation tools to make that feasible at scale.

With AWS, you can use CloudFormation, CDK, or Terraform to provision dedicated resources per tenant—databases, S3 buckets, Lambda functions, and even isolated VPCs if required. Services like EventBridge or Step Functions can orchestrate the entire flow: when a new tenant signs up, your system triggers a pipeline that creates their environment, configures access, and notifies your app.

GCP offers similar functionality through tools like Deployment Manager, Workflows, and Cloud Functions. You can set up Cloud SQL instances for per-tenant databases, deploy Cloud Run services for tenant-specific APIs, or isolate workloads with separate projects or namespaces. Pub/Sub can act as the event bus that kicks off provisioning workflows based on user actions or internal triggers.

In both cases, treating infrastructure as code makes tenant provisioning consistent, repeatable, and secure. For enterprise-grade SaaS, this approach not only meets isolation and compliance requirements—it becomes a selling point for larger customers who expect guarantees around performance and data segregation.

Conclusion
Designing for multi-tenancy is about more than just scaling. It’s about trust, flexibility, and maintainability. As your user base grows and your customer’s needs evolve, your architecture should support that growth without adding friction or risk.

The right combination of tools with the proper strategy can help you avoid scaling issues down the road. Using the knowledge and recommended tools outlined in this article, you are now well-equipped to design a multi-tenant SaaS architecture that scales from your first 10 users to your next 10,000.
