import { auth } from "@clerk/nextjs/server";

/**
 * Get the Convex auth token for server-side requests.
 * Used with preloadQuery, fetchQuery, fetchMutation, etc.
 */
export async function getAuthToken() {
  return (await (await auth()).getToken({ template: "convex" })) ?? undefined;
}
