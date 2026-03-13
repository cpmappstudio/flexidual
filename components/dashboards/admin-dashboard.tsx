"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useParams } from "next/navigation";
import { 
  Building2, 
  SquareUserRound, 
  Presentation, 
  BookMarked, 
  GraduationCap, 
  LucideIcon 
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminClassTrackingCard } from "@/components/admin/admin-class-tracking-card";
import FlexidualHeader from "../flexidual-header";

export default function AdminDashboard() {
  const t = useTranslations();
  const params = useParams();

  // Resolve context
  let currentSlug = (params.orgSlug as string) || "system";
  if (currentSlug === "admin") currentSlug = "system";

  const orgContext = useQuery(api.organizations.resolveSlug, { slug: currentSlug });
  const isSystemDashboard = orgContext?.type === "system";

  // Superadmin filter state
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("all");
  const schools = useQuery(api.schools.list, isSystemDashboard ? {} : "skip");

  // Calculate effective query arguments
  let queryOrgType = orgContext?.type;
  let queryOrgId = orgContext?._id;
  let querySchoolId = undefined;
  let queryCampusId = undefined;

  if (isSystemDashboard && selectedSchoolId !== "all") {
    queryOrgType = "school";
    queryOrgId = selectedSchoolId as Id<"schools">;
    querySchoolId = selectedSchoolId as Id<"schools">;
  } else if (orgContext?.type === "school") {
    querySchoolId = orgContext._id as Id<"schools">;
  } else if (orgContext?.type === "campus") {
    queryCampusId = orgContext._id as Id<"campuses">;
  }

  // Pass the calculated arguments to the queries
  const teachers = useQuery(api.users.getUsers, orgContext ? { role: "teacher", isActive: true, orgType: queryOrgType, orgId: queryOrgId } : "skip");
  const students = useQuery(api.users.getUsers, orgContext ? { role: "student", isActive: true, orgType: queryOrgType, orgId: queryOrgId } : "skip");
  const activeClasses = useQuery(api.classes.list, orgContext ? { isActive: true, schoolId: querySchoolId, campusId: queryCampusId } : "skip");
  const curriculums = useQuery(api.curriculums.list, orgContext ? { includeInactive: false, schoolId: querySchoolId } : "skip");
  
  const allSchedules = useQuery(api.schedule.getMySchedule, {});

  const isLoading =
    teachers === undefined ||
    students === undefined ||
    activeClasses === undefined ||
    curriculums === undefined ||
    allSchedules === undefined;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6 animate-pulse">
        <div className="h-24 bg-card rounded-xl border border-border"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-card rounded-xl border border-border"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <FlexidualHeader
        title={t("admin.title")}
        subtitle={t("admin.description")}
      />
      
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Superadmin School Filter */}
        {isSystemDashboard && (
          <div className="flex justify-end">
            <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
              <SelectTrigger className="w-full sm:w-auto min-w-[200px] max-w-[350px]">
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {selectedSchoolId === "all" ? "All Schools" : schools?.find(s => s._id === selectedSchoolId)?.name || "Select School"}
                  </span>
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
          </div>
        )}

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatCard title={t("navigation.teachers") || "Active Teachers"} value={teachers?.length || 0} icon={SquareUserRound} />
          <StatCard title={t("navigation.students") || "Active Students"} value={students?.length || 0} icon={GraduationCap} />
          <StatCard title={t("navigation.allCurriculums") || "Curriculums"} value={curriculums?.length || 0} icon={BookMarked} />
          <StatCard title={t("navigation.allClasses") || "Active Classes"} value={activeClasses?.length || 0} icon={Presentation} />
        </div>

        {/* Class & Teacher Tracking */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
                {t("admin.classTracking")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("admin.classTrackingDescription") || "Monitor overall progress and verify instructor attendance."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {activeClasses?.length === 0 ? (
              <Card className="dashboard-card p-8 text-center border-dashed">
                <p className="text-muted-foreground font-bold">No active classes found.</p>
              </Card>
            ) : (
              activeClasses?.map((cls) => {
                const classSchedules = allSchedules?.filter((s) => s.classId === cls._id) || [];
                const matchingCurriculum = curriculums?.find((c) => c._id === cls.curriculumId);
                const enrichedClassData = {
                  name: cls.name,
                  curriculumTitle: matchingCurriculum?.title,
                  students: cls.students,
                };

                return (
                  <AdminClassTrackingCard
                    key={cls._id}
                    classData={enrichedClassData}
                    schedules={classSchedules}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number | string; icon: LucideIcon; }) {
  return (
    <Card className="border border-primary/20 shadow-sm overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-card to-secondary/10 pointer-events-none" />
      <CardHeader className="flex flex-col items-start justify-between space-y-0 relative">
        <div className="flex items-center gap-2">
          <div className="rounded-lg">
            <Icon className="lg:w-8 lg:h-8 text-primary/80" />
          </div>
          <CardTitle className="sm:text-sm lg:text-xl font-semibold text-foreground ml-2">
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <p className="sm:text-xl lg:text-2xl font-bold text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}