"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";

export function useTaskFileRequest() {
  const { getToken } = useAuth();
  return useCallback(
    async (params: Record<string, string>, init?: RequestInit) => {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("PERMISSION_DENIED");
      const site =
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
        process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
          /\.convex\.cloud$/,
          ".convex.site",
        );
      if (!site) throw new Error("UPLOAD_FAILED");
      const url = new URL("/course-task-files", site);
      url.search = new URLSearchParams(params).toString();
      const response = await fetch(url, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const error =
          result && typeof result === "object" && "error" in result
            ? result.error
            : null;
        throw new Error(typeof error === "string" ? error : "UPLOAD_FAILED");
      }
      return response;
    },
    [getToken],
  );
}
