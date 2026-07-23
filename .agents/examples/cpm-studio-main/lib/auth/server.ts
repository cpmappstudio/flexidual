import "server-only";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { cache } from "react";
import { api } from "@/convex/_generated/api";

export const getConvexAuthToken = cache(async () => {
  return await convexAuthNextjsToken();
});

export const getCurrentConvexAuthState = cache(async () => {
  const token: string | undefined = await getConvexAuthToken();

  if (!token) {
    return {
      currentUser: null,
      token: null,
    };
  }

  return {
    currentUser: await fetchQuery(api.users.current, {}, { token }),
    token,
  };
});

export const getCurrentConvexUser = cache(async () => {
  return (await getCurrentConvexAuthState()).currentUser;
});
