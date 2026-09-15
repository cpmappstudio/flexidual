"use client";

import usePresence from "@convex-dev/presence/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";

function Connection({ userId }: { userId: string }) {
  usePresence(api.presence, userId, userId, 30_000);
  return null;
}

export function PresenceTracker() {
  const { user } = useCurrentUser();
  return user?.isActive ? (
    <Connection key={user._id} userId={user._id} />
  ) : null;
}
