"use client";

import type { ReactNode } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
} from "convex/react";
import { Skeleton } from "@/components/ui/skeleton";

function AuthFallback() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Skeleton className="h-10 w-56" />
    </main>
  );
}

export function ConvexAuthBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <AuthLoading>
        <AuthFallback />
      </AuthLoading>
      <Authenticated>{children}</Authenticated>
      <Unauthenticated>
        <AuthFallback />
      </Unauthenticated>
    </>
  );
}
