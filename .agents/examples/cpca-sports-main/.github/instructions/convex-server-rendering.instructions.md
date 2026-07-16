Next.js Server Rendering
Next.js automatically renders both Client and Server Components on the server during the initial page load.

By default Client Components will not wait for Convex data to be loaded, and your UI will render in a "loading" state. Read on to learn how to preload data during server rendering and how to interact with the Convex deployment from Next.js server-side.

Example: Next.js App Router

This pages covers the App Router variant of Next.js.

Next.js Server Rendering support is in beta
Next.js Server Rendering support is currently a beta feature. If you have feedback or feature requests, let us know on Discord!

Preloading data for Client Components
If you want to preload data from Convex and leverage Next.js server rendering, but still retain reactivity after the initial page load, use preloadQuery from convex/nextjs.

In a Server Component call preloadQuery:

app/TasksWrapper.tsx
TS
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Tasks } from "./Tasks";

export async function TasksWrapper() {
  const preloadedTasks = await preloadQuery(api.tasks.list, {
    list: "default",
  });
  return <Tasks preloadedTasks={preloadedTasks} />;
}

In a Client Component call usePreloadedQuery:

app/TasksWrapper.tsx
TS
"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function Tasks(props: {
  preloadedTasks: Preloaded<typeof api.tasks.list>;
}) {
  const tasks = usePreloadedQuery(props.preloadedTasks);
  // render `tasks`...
  return <div>...</div>;
}

preloadQuery takes three arguments:

The query reference
Optionally the arguments object passed to the query
Optionally a NextjsOptions object
preloadQuery uses the cache: 'no-store' policy so any Server Components using it will not be eligible for static rendering.

Using the query result
preloadQuery returns an opaque Preloaded payload that should be passed through to usePreloadedQuery. If you want to use the return value of the query, perhaps to decide whether to even render the Client Component, you can pass the Preloaded payload to the preloadedQueryResult function.

Using Convex to render Server Components
If you need Convex data on the server, you can load data from Convex in your Server Components, but it will be non-reactive. To do this, use the fetchQuery function from convex/nextjs:

app/StaticTasks.tsx
TS
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export async function StaticTasks() {
  const tasks = await fetchQuery(api.tasks.list, { list: "default" });
  // render `tasks`...
  return <div>...</div>;
}

Server Actions and Route Handlers
Next.js supports building HTTP request handling routes, similar to Convex HTTP Actions. You can use Convex from a Server Action or a Route Handler as you would any other database service.

To load and edit Convex data in your Server Action or Route Handler, you can use the fetchQuery, fetchMutation and fetchAction functions.

Here's an example inline Server Action calling a Convex mutation:

app/example/page.tsx
TS
import { api } from "@/convex/_generated/api";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { revalidatePath } from "next/cache";

export default async function PureServerPage() {
  const tasks = await fetchQuery(api.tasks.list, { list: "default" });
  async function createTask(formData: FormData) {
    "use server";

    await fetchMutation(api.tasks.create, {
      text: formData.get("text") as string,
    });
    revalidatePath("/example");
  }
  // render tasks and task creation form
  return <form action={createTask}>...</form>;
}

Here's an example Route Handler calling a Convex mutation:

app/api/route.ts
TS
import { NextResponse } from "next/server";
// Hack for TypeScript before 5.2
const Response = NextResponse;

import { api } from "@/convex/_generated/api";
import { fetchMutation } from "convex/nextjs";

export async function POST(request: Request) {
  const args = await request.json();
  await fetchMutation(api.tasks.create, { text: args.text });
  return Response.json({ success: true });
}

Server-side authentication
To make authenticated requests to Convex during server rendering, pass a JWT token to preloadQuery or fetchQuery in the third options argument:

app/TasksWrapper.tsx
TS
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Tasks } from "./Tasks";

export async function TasksWrapper() {
  const token = await getAuthToken();
  const preloadedTasks = await preloadQuery(
    api.tasks.list,
    { list: "default" },
    { token },
  );
  return <Tasks preloadedTasks={preloadedTasks} />;
}

The implementation of getAuthToken depends on your authentication provider.

Clerk
Auth0
app/auth.ts
TS
import { auth } from "@clerk/nextjs/server";

export async function getAuthToken() {
  return (await (await auth()).getToken({ template: "convex" })) ?? undefined;
}

Configuring Convex deployment URL
Convex hooks used by Client Components are configured via the ConvexReactClient constructor, as shown in the Next.js Quickstart.

To use preloadQuery, fetchQuery, fetchMutation and fetchAction in Server Components, Server Actions and Route Handlers you must either:

have NEXT_PUBLIC_CONVEX_URL environment variable set to the Convex deployment URL
or pass the url option in the third argument to preloadQuery, fetchQuery, fetchMutation or fetchAction
Consistency
preloadQuery and fetchQuery use the ConvexHTTPClient under the hood. This client is stateless. This means that two calls to preloadQuery are not guaranteed to return consistent data based on the same database state. This is similar to more traditional databases, but is different from the guaranteed consistency provided by the ConvexReactClient.

To prevent rendering an inconsistent UI avoid using multiple preloadQuery calls on the same page.