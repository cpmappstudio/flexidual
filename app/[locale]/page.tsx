"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "@/i18n/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { SchoolDialog } from "@/components/admin/schools/school-dialog";

export default function OrganizationEntryPage() {
  const router = useRouter();
  const options = useQuery(api.organizations.getSwitcherOptions);

  useEffect(() => {
    if (!options) return;
    const destination = options.campuses[0]?.slug ?? options.schools[0]?.slug;
    if (destination) router.replace(`/${destination}`);
  }, [options, router]);

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
