"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import {
  SquareUserRound,
  Presentation,
  BookMarked,
  GraduationCap,
  LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminClassTrackingCard } from "@/components/admin/admin-class-tracking-card";

import { useStaffAccess } from "@/hooks/use-staff-access";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";

export default function AdminDashboard() {
  const t = useTranslations();
  const params = useParams<{ orgSlug: string }>();
  const orgContext = useQuery(api.organizations.resolveSlug, {
    slug: params.orgSlug,
  });
  const { access, isLoading: isAccessLoading } = useStaffAccess();
  const { context: settingsContext } = useSettingsContext();
  const now = useCurrentMinute();

  const queryOrgType =
    orgContext?.type === "school" || orgContext?.type === "campus"
      ? orgContext.type
      : undefined;
  const queryOrgId = queryOrgType ? orgContext?._id : undefined;
  const querySchoolId =
    orgContext?.type === "school"
      ? orgContext._id
      : settingsContext?.institution._id;
  const queryCampusId =
    orgContext?.type === "campus" ? orgContext._id : undefined;

  const canViewPeople = access?.canViewPeople ?? false;
  const teachers = useQuery(
    api.users.getUsers,
    queryOrgType && queryOrgId && canViewPeople
      ? {
          role: "teacher",
          isActive: true,
          orgType: queryOrgType,
          orgId: queryOrgId,
        }
      : "skip",
  );
  const students = useQuery(
    api.users.getUsers,
    queryOrgType && queryOrgId && canViewPeople
      ? {
          role: "student",
          isActive: true,
          orgType: queryOrgType,
          orgId: queryOrgId,
        }
      : "skip",
  );
  const activeClasses = useQuery(
    api.classes.listOverview,
    orgContext
      ? {
          schoolId: orgContext.type === "school" ? orgContext._id : undefined,
          campusId: queryCampusId,
        }
      : "skip",
  );
  const curriculums = useQuery(
    api.curriculums.list,
    querySchoolId
      ? { includeInactive: false, schoolId: querySchoolId }
      : "skip",
  );
  const scheduleResult = useQuery(
    api.schedule.getMySchedule,
    orgContext
      ? {
          now,
          includeRecordings: false,
          schoolId: orgContext.type === "school" ? orgContext._id : undefined,
          campusId: queryCampusId,
        }
      : "skip",
  );
  const scheduleScopeKey = orgContext
    ? `${orgContext.type}:${orgContext._id}`
    : "unresolved";
  const allSchedules = useRetainedQueryResult(
    scheduleResult,
    scheduleScopeKey,
  );

  const visibleTeacherCount = canViewPeople
    ? teachers?.length
    : activeClasses?.teachers.length;
  const visibleStudentCount = canViewPeople
    ? students?.length
    : activeClasses?.uniqueStudentCount;

  const isLoading =
    isAccessLoading ||
    (canViewPeople && (teachers === undefined || students === undefined)) ||
    activeClasses === undefined ||
    curriculums === undefined ||
    allSchedules === undefined;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 bg-card rounded-xl border border-border"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 bg-card rounded-xl border border-border"
            ></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          title={t("navigation.teachers") || "Active Teachers"}
          value={visibleTeacherCount || 0}
          icon={SquareUserRound}
        />
        <StatCard
          title={t("navigation.students") || "Active Students"}
          value={visibleStudentCount || 0}
          icon={GraduationCap}
        />
        <StatCard
          title={t("navigation.allCurriculums") || "Curriculums"}
          value={curriculums?.length || 0}
          icon={BookMarked}
        />
        <StatCard
          title={t("navigation.allClasses") || "Active Classes"}
          value={activeClasses?.classes.length || 0}
          icon={Presentation}
        />
      </div>

      {/* Class & Teacher Tracking */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
              {t("admin.classTracking")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("admin.classTrackingDescription") ||
                "Monitor overall progress and verify instructor attendance."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {activeClasses?.classes.length === 0 ? (
            <Card className="dashboard-card p-8 text-center border-dashed">
              <p className="text-muted-foreground font-bold">
                No active classes found.
              </p>
            </Card>
          ) : (
            activeClasses?.classes.map((cls) => {
              const classSchedules =
                allSchedules?.filter((s) => s.classId === cls._id) || [];
              const matchingCurriculum = curriculums?.find(
                (c) => c._id === cls.curriculumId,
              );
              const enrichedClassData = {
                name: cls.name,
                curriculumTitle: matchingCurriculum?.title,
                studentCount: cls.studentCount,
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
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
}) {
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
