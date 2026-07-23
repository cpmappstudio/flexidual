"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function InvitationSignOutButton({ label }: { label: string }) {
  const { signOut } = useAuthActions();
  const { refresh } = useRouter();

  async function handleClick() {
    await signOut();
    refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={() => void handleClick()}>
      {label}
    </Button>
  );
}
