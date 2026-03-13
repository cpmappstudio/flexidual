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
  MapPin,
  Building2,
} from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";
import { ClassDialog } from "@/components/teaching/classes/class-dialog";
import { ClassCombinedFilter } from "@/components/teaching/classes/class-combined-filter";
import { ClassesTable } from "@/components/teaching/classes/classes-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassWeekOverview } from "@/components/teaching/classes/class-week-overview";
import FlexidualHeader from "@/components/flexidual-header";

export default function MyClassesPage() {
  const t = useTranslations();
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const params = useParams();
  
  // Normalize slug for context mapping
  let currentSlug = (params.orgSlug as string) || "system";
  if (currentSlug === "admin") currentSlug = "system";

  const orgContext = useQuery(api.organizations.resolveSlug, { slug: currentSlug });
  const isSystemDashboard = orgContext?.type === "system";
  
  const { sessionClaims } = useAuth();
  const role = getRoleForOrg(sessionClaims, currentSlug);
  const isAdmin = role === "admin" || role === "principal" || role === "superadmin";
  
  const [selectedTeacherId, setSelectedTeacherId] = useState<Id<"users"> | null>(null);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<Id<"curriculums"> | null>(null);
  
  // Superadmin filtering state
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("all");
  const [selectedCampusId, setSelectedCampusId] = useState<string>("all");

  const schools = useQuery(api.schools.list, isSystemDashboard ? {} : "skip");
  const campuses = useQuery(
    api.campuses.list,
    isSystemDashboard && selectedSchoolId !== "all"
      ? { schoolId: selectedSchoolId as Id<"schools"> }
      : "skip"
  );

  let querySchoolId = undefined;
  let queryCampusId = undefined;

  if (isSystemDashboard) {
    if (selectedCampusId !== "all") queryCampusId = selectedCampusId;
    if (selectedSchoolId !== "all") querySchoolId = selectedSchoolId;
  } else if (orgContext?.type === "school") {
    querySchoolId = orgContext._id;
  } else if (orgContext?.type === "campus") {
    queryCampusId = orgContext._id;
  }
  
  // Inject the parameters into the queryArgs
  const queryArgs = isAdmin 
    ? { 
        teacherId: selectedTeacherId || undefined,
        schoolId: querySchoolId as Id<"schools"> | undefined,
        campusId: queryCampusId as Id<"campuses"> | undefined,
      } 
    : (user ? { teacherId: user._id } : "skip");

  const allClasses = useQuery(api.classes.list, queryArgs);
  const curriculums = useQuery(api.curriculums.list, {});

  const startOfCurrentWeek = startOfWeek(new Date(), { weekStartsOn: 0 });
  const endOfCurrentWeek = addDays(startOfCurrentWeek, 7);

  // Prevent Validator crash by skipping the schedule query for Admins
  const scheduleArgs = (queryArgs === "skip" || isAdmin) ? "skip" : {
    ...queryArgs,
    from: startOfCurrentWeek.getTime(),
    to: endOfCurrentWeek.getTime()
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
        title={isAdmin ? t("class.allClasses") : t("class.myClasses")}
        subtitle={
          isAdmin
            ? t("class.manageAllDescription")
            : t("class.manageMyDescription")
        }
      />
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Superadmin Org Filters */}
        {isSystemDashboard && (
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-muted/30 rounded-lg border">
            <Select
              value={selectedSchoolId}
              onValueChange={(val) => {
                setSelectedSchoolId(val);
                setSelectedCampusId("all");
              }}
            >
              <SelectTrigger className="w-full sm:w-auto min-w-[200px] max-w-[350px]">
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate"><SelectValue placeholder="All Schools" /></span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schools</SelectItem>
                {schools?.map((school) => (
                  <SelectItem key={school._id} value={school._id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedCampusId}
              onValueChange={setSelectedCampusId}
              disabled={selectedSchoolId === "all"}
            >
              <SelectTrigger className="w-full sm:w-auto min-w-[200px] max-w-[350px]">
                <div className="flex items-center gap-2 truncate">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate"><SelectValue placeholder="All Campuses" /></span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campuses</SelectItem>
                {campuses?.map((campus) => (
                  <SelectItem key={campus._id} value={campus._id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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