import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ProfileActiveSessionsList } from "@/components/profile/profile-active-sessions-list";
import { ProfileGuardianPinForm } from "@/components/profile/profile-guardian-pin-form";
import { ProfilePasswordForm } from "@/components/profile/profile-password-form";
import type { ProfileSession } from "@/components/profile/types";

export function ProfileSecuritySection({
  sessions,
  tenantSlug,
  onSignOutCurrentSession,
}: {
  sessions: ProfileSession[] | undefined;
  tenantSlug?: string;
  onSignOutCurrentSession: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ProfilePasswordForm />
      <ProfileGuardianPinForm tenantSlug={tenantSlug} />
      <Separator />
      {sessions === undefined ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-18 w-full rounded-2xl" />
            <Skeleton className="h-18 w-full rounded-2xl" />
          </div>
        </div>
      ) : (
        <ProfileActiveSessionsList
          sessions={sessions}
          onSignOutCurrentSession={onSignOutCurrentSession}
        />
      )}
    </div>
  );
}
