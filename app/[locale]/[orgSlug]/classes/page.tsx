"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getRoleForOrg } from "@/lib/rbac";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  BookOpen,
  Calendar,
  ArrowRight,
  School,
  Edit,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";
import { ClassDialog } from "@/components/teaching/classes/class-dialog";
import { ClassCombinedFilter } from "@/components/teaching/classes/class-combined-filter";
import { ClassesTable } from "@/components/teaching/classes/classes-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassWeekOverview } from "@/components/teaching/classes/class-week-overview";
import FlexidualHeader from "@/components/flexidual-header";

export default function MyClassesPage() {
  const t = useTranslations();
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const { sessionClaims } = useAuth();
  const role = getRoleForOrg(sessionClaims, orgSlug);
  const isAdmin =
    role === "admin" || role === "principal" || role === "superadmin";
  const [selectedTeacherId, setSelectedTeacherId] =
    useState<Id<"users"> | null>(null);
  const [selectedCurriculumId, setSelectedCurriculumId] =
    useState<Id<"curriculums"> | null>(null);

  const queryArgs = isAdmin
    ? selectedTeacherId
      ? { teacherId: selectedTeacherId }
      : {}
    : user
      ? { teacherId: user._id }
      : "skip";

  const allClasses = useQuery(api.classes.list, queryArgs);
  const curriculums = useQuery(api.curriculums.list, {});

  const startOfCurrentWeek = startOfWeek(new Date(), { weekStartsOn: 0 });
  const endOfCurrentWeek = addDays(startOfCurrentWeek, 7);

  const scheduleArgs =
    queryArgs === "skip"
      ? "skip"
      : {
          ...queryArgs,
          from: startOfCurrentWeek.getTime(),
          to: endOfCurrentWeek.getTime(),
        };

  const weekSchedules = useQuery(api.schedule.getMySchedule, scheduleArgs);

  const classes = useMemo(() => {
    if (!allClasses) return undefined;
    if (!selectedCurriculumId) return allClasses;
    return allClasses.filter(
      (cls) => cls.curriculumId === selectedCurriculumId,
    );
  }, [allClasses, selectedCurriculumId]);

  if (isUserLoading || classes === undefined) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[200px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  const getCurriculumTitle = (id: string) => {
    return (
      curriculums?.find((c) => c._id === id)?.title || t("curriculum.unknown")
    );
  };

  const renderWeekOverview = () => {
    if (isAdmin) return null;
    if (weekSchedules === undefined)
      return <Skeleton className="h-16 w-full rounded-xl" />;
    if (weekSchedules.length > 0)
      return <ClassWeekOverview schedules={weekSchedules} variant="compact" />;
    return null;
  };

  return (
    <>
      <FlexidualHeader
        title={isAdmin ? t("class.title") : t("class.myClasses")}
        subtitle={
          isAdmin
            ? t("class.manageAllDescription")
            : t("class.manageMyDescription")
        }
      />
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {renderWeekOverview()}
        {classes.length === 0 ? (
          <EmptyState isAdmin={isAdmin} />
        ) : (
          <ClassesTable
            data={classes}
            curriculums={curriculums ?? undefined}
            customFilter={
              <ClassCombinedFilter
                selectedTeacherId={selectedTeacherId}
                onSelectTeacher={setSelectedTeacherId}
                selectedCurriculumId={selectedCurriculumId}
                onSelectCurriculum={setSelectedCurriculumId}
                isAdmin={isAdmin}
              />
            }
          />
        )}
      </div>
    </>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations();
  return (
    <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
      <div className="rounded-full bg-primary/10 p-4 mb-4">
        <School className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{t("class.noActive")}</h3>
      <p className="text-muted-foreground mb-4 max-w-sm">
        {isAdmin ? t("class.createPrompt") : t("class.notAssigned")}
      </p>
      {isAdmin && <ClassDialog />}
    </Card>
  );
}
