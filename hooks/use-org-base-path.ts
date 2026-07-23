"use client";

import { useParams } from "next/navigation";

export function useOrgBasePath() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return `/${orgSlug}`;
}
