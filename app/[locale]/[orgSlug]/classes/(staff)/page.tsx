"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Plus, School } from "lucide-react";

import { ClassFilters } from "@/components/teaching/classes/class-combined-filter";
import { ClassesTable } from "@/components/teaching/classes/classes-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ResponsivePageAction } from "@/components/ui/responsive-page-action";
import { Link } from "@/i18n/navigation";

import { useStaffAccess } from "@/hooks/use-staff-access";
import { useSettingsContext } from "@/hooks/use-settings-context";

export default function MyClassesPage() {
  const params = useParams<{ orgSlug: string }>();
  const basePath = `/${params.orgSlug}`;

  const { access, isLoading: isAccessLoading } = useStaffAccess();
  const { context: settingsContext, isLoading: isSettingsLoading } =
    useSettingsContext();
  const canManage = access?.canManageCampus ?? false;
  const orgContext = useQuery(
    api.organizations.resolveSlug,
    access ? { slug: params.orgSlug } : "skip",
  );

  const [selectedTeacherId, setSelectedTeacherId] =
    useState<Id<"users"> | null>(null);
  const [selectedCurriculumId, setSelectedCurriculumId] =
    useState<Id<"curriculums"> | null>(null);
  const [selectedAcademicPeriodId, setSelectedAcademicPeriodId] =
    useState<Id<"academicPeriods"> | null>(null);
  const [selectedGradeCode, setSelectedGradeCode] = useState<string | null>(
    null,
  );

  const querySchoolId =
    orgContext?.type === "school" ? orgContext._id : undefined;
  const queryCampusId =
    orgContext?.type === "campus" ? orgContext._id : undefined;
  const institutionSchoolId = querySchoolId ?? settingsContext?.institution._id;

  const tableData = useQuery(
    api.classes.listOverview,
    access && orgContext
      ? {
          schoolId: querySchoolId as Id<"schools"> | undefined,
          campusId: queryCampusId as Id<"campuses"> | undefined,
        }
      : "skip",
  );
  const curriculums = useQuery(
    api.curriculums.list,
    institutionSchoolId
      ? { includeInactive: true, schoolId: institutionSchoolId }
      : "skip",
  );
  const academicSettings = useQuery(
    api.academicSettings.get,
    institutionSchoolId
      ? {
          schoolId: institutionSchoolId,
          campusId: queryCampusId as Id<"campuses"> | undefined,
        }
      : "skip",
  );
  const grades = useQuery(
    api.grades.list,
    institutionSchoolId ? { schoolId: institutionSchoolId } : "skip",
  );
  const classes = useMemo(() => {
    if (!tableData) return undefined;
    return tableData.classes.filter(
      (classData) =>
        (!selectedTeacherId || classData.teacherId === selectedTeacherId) &&
        (!selectedCurriculumId ||
          classData.curriculumId === selectedCurriculumId) &&
        (!selectedAcademicPeriodId ||
          classData.academicPeriodId === selectedAcademicPeriodId) &&
        (!selectedGradeCode || classData.gradeCode === selectedGradeCode),
    );
  }, [
    selectedAcademicPeriodId,
    selectedCurriculumId,
    selectedGradeCode,
    selectedTeacherId,
    tableData,
  ]);
  const hasTableFilters = Boolean(
    selectedTeacherId ||
      selectedCurriculumId ||
      selectedAcademicPeriodId ||
      selectedGradeCode,
  );

  if (
    isAccessLoading ||
    isSettingsLoading ||
    classes === undefined ||
    curriculums === undefined ||
    grades === undefined ||
    academicSettings === undefined ||
    tableData === undefined
  ) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[200px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {classes.length === 0 && !hasTableFilters ? (
        <EmptyState canManage={canManage} basePath={basePath} />
      ) : (
        <ClassesTable
          data={classes}
          curriculums={curriculums ?? undefined}
          grades={grades}
          academicPeriods={academicSettings?.periods}
          teachers={tableData.teachers}
          customFilter={
            <ClassFilters
              periods={academicSettings?.periods ?? []}
              selectedAcademicPeriodId={selectedAcademicPeriodId}
              onSelectAcademicPeriod={setSelectedAcademicPeriodId}
              selectedTeacherId={selectedTeacherId}
              onSelectTeacher={setSelectedTeacherId}
              selectedCurriculumId={selectedCurriculumId}
              onSelectCurriculum={setSelectedCurriculumId}
              selectedGradeCode={selectedGradeCode}
              onSelectGrade={setSelectedGradeCode}
              curriculums={
                curriculums?.filter((curriculum) => curriculum.isActive) ?? []
              }
              grades={grades}
              teachers={tableData.teachers}
              isAdmin={canManage}
            />
          }
          canManage={canManage}
        />
      )}
    </div>
  );
}

function EmptyState({
  canManage,
  basePath,
}: {
  canManage: boolean;
  basePath: string;
}) {
  const t = useTranslations();

  return (
    <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
      <div className="rounded-full bg-primary/10 p-4 mb-4">
        <School className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{t("class.noActive")}</h3>
      <p className="text-muted-foreground mb-4 max-w-sm">
        {canManage ? t("class.createPrompt") : t("class.notAssigned")}
      </p>
      {canManage && (
        <ResponsivePageAction>
          <Button asChild>
            <Link
              href={`${basePath}/classes/new`}
              aria-label={t("class.createClass")}
            >
              <Plus />
              <span className="hidden sm:inline">{t("class.createClass")}</span>
            </Link>
          </Button>
        </ResponsivePageAction>
      )}
    </Card>
  );
}
