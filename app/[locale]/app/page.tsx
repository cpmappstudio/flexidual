"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "@/i18n/navigation";
import { SchoolDialog } from "@/components/admin/schools/school-dialog";
import { ConvexAuthBoundary } from "@/components/convex-auth-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { getCampusDestination, getLastCampusSlug } from "@/lib/last-campus";

export default function OrganizationEntryPage() {
  return (
    <ConvexAuthBoundary>
      <OrganizationEntryContent />
    </ConvexAuthBoundary>
  );
}

function OrganizationEntryContent() {
  const router = useRouter();
  const { userId } = useAuth();
  const options = useQuery(api.organizations.getSwitcherOptions);

  useEffect(() => {
    if (!options || !userId) return;
    const destination =
      getCampusDestination(options.campuses, getLastCampusSlug(userId)) ??
      options.schools[0]?.slug;
    if (destination) router.replace(`/${destination}/catalog`);
  }, [options, router, userId]);

  if (options && options.schools.length === 0) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <SchoolDialog />
      </main>
    );
  }

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Skeleton className="h-10 w-56" />
    </main>
  );
}
