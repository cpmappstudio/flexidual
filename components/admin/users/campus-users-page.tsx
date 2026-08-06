"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { UsersTable } from "@/components/admin/users/users-table";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { useRouter } from "@/i18n/navigation";
import * as React from "react";
import { TableResultCount } from "@/components/table/table-result-count";

export function CampusUsersPage({ type }: { type: "students" | "professors" }) {
  const t = useTranslations("navigation");
  const router = useRouter();
  const { access, isLoading: isAccessLoading } = useStaffAccess();
  const isStudents = type === "students";
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const params = useParams<{ orgSlug?: string }>();
  const basePath = `/${params.orgSlug}`;
  const orgContext = useQuery(
    api.organizations.resolveSlug,
    isAuthenticated ? { slug: params.orgSlug ?? "system" } : "skip",
  );
  const campusId = orgContext?.type === "campus" ? orgContext._id : undefined;
  const [visibleCount, setVisibleCount] = React.useState<number | null>(null);

  const title = isStudents ? t("students") : t("teachers");

  React.useEffect(() => {
    if (!isAccessLoading && access && !access.canViewPeople) {
      router.replace(basePath);
    }
  }, [access, basePath, isAccessLoading, router]);

  if (
    isAuthLoading ||
    isAccessLoading ||
    !isAuthenticated ||
    orgContext === undefined ||
    !access?.canViewPeople
  ) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <h1 className="border-b pb-3 text-2xl font-semibold">
        {title}
        <TableResultCount count={visibleCount} />
      </h1>
      {campusId ? (
        <UsersTable
          roleFilter={isStudents ? "student" : "teacher"}
          allowedRoles={isStudents ? ["student"] : ["teacher"]}
          scope={{ orgType: "campus", orgId: campusId }}
          hideRole
          readOnly={!access.canManagePeople}
          onFilteredRowCountChange={setVisibleCount}
          onRowClick={
            isStudents
              ? (student) => router.push(`${basePath}/students/${student._id}`)
              : undefined
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("selectCampus")}</p>
      )}
    </section>
  );
}
