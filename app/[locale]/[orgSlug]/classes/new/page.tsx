"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  CourseFormData,
  CourseFormFields,
} from "@/components/teaching/classes/course-form-fields";
import {
  CourseWeeklyCalendar,
  CourseWeeklySlot,
} from "@/components/teaching/classes/course-weekly-calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { Link, useRouter } from "@/i18n/navigation";
import { todayInTimeZone } from "@/lib/time-zone";
import { useStaffAccess } from "@/hooks/use-staff-access";

export default function CreateCoursePage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params.orgSlug as string) || "system";
  const { access, isLoading: isAccessLoading } = useStaffAccess();
  const isAdmin = access?.canManageCampus ?? false;
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });
  const { context: settingsContext, basePath: settingsBasePath } =
    useSettingsContext();
  const schoolId = settingsContext?.institution._id;
  const campusId =
    orgContext?.type === "campus"
      ? (orgContext._id as Id<"campuses">)
      : undefined;
  const curriculums = useQuery(
    api.curriculums.list,
    isAdmin && schoolId ? { includeInactive: false, schoolId } : "skip",
  );
  const teachers = useQuery(
    api.users.getUsers,
    isAdmin && campusId
      ? {
          role: "teacher",
          orgType: "campus",
          orgId: campusId,
        }
      : "skip",
  );
  const academicSettings = useQuery(
    api.academicSettings.get,
    isAdmin && schoolId ? { schoolId, campusId } : "skip",
  );
  const grades = useQuery(
    api.grades.list,
    isAdmin && schoolId ? { schoolId } : "skip",
  );
  const createCourse = useMutation(api.classes.createWithSchedule);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [academicPeriodId, setAcademicPeriodId] = useState("");
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const [showExistingSchedules, setShowExistingSchedules] = useState(true);
  const [weeklySlots, setWeeklySlots] = useState<CourseWeeklySlot[]>([]);
  const [formData, setFormData] = useState<CourseFormData>({
    name: "",
    description: "",
    curriculumId: "",
    teacherId: "",
    gradeCode: "",
    liveAccess: { mode: "private", allowedGradeCodes: [] },
  });
  const scheduleGuides = useQuery(
    api.classes.listWeeklyScheduleGuides,
    isAdmin &&
      showExistingSchedules &&
      campusId &&
      academicPeriodId &&
      formData.gradeCode
      ? {
          campusId,
          academicPeriodId: academicPeriodId as Id<"academicPeriods">,
          gradeCode: formData.gradeCode,
        }
      : "skip",
  );

  useEffect(() => {
    if (!isAccessLoading && access && !access.canManageCampus) {
      router.replace(`/${orgSlug}/classes`);
    }
  }, [access, isAccessLoading, orgSlug, router]);

  const availablePeriods = useMemo(() => {
    if (!academicSettings?.timeZone) return [];
    const today = todayInTimeZone(academicSettings.timeZone);
    return academicSettings.periods.filter((period) => period.endDate >= today);
  }, [academicSettings]);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
    [locale],
  );
  const suggestedName = useMemo(() => {
    const curriculum = curriculums?.find(
      (item) => item._id === formData.curriculumId,
    );
    const teacher = teachers?.find((item) => item._id === formData.teacherId);
    const period = availablePeriods.find(
      (item) => item._id === academicPeriodId,
    );

    return curriculum && teacher && period
      ? `${curriculum.title} · ${teacher.fullName} · ${period.name}`
      : "";
  }, [
    academicPeriodId,
    availablePeriods,
    curriculums,
    formData.curriculumId,
    formData.teacherId,
    teachers,
  ]);

  useEffect(() => {
    if (availablePeriods.some((period) => period._id === academicPeriodId)) {
      return;
    }
    const today = academicSettings?.timeZone
      ? todayInTimeZone(academicSettings.timeZone)
      : "";
    const currentPeriod = availablePeriods.find(
      (period) => period.startDate <= today && period.endDate >= today,
    );
    setAcademicPeriodId(
      currentPeriod?._id ??
        (availablePeriods.length === 1 ? availablePeriods[0]._id : ""),
    );
  }, [academicPeriodId, academicSettings?.timeZone, availablePeriods]);

  useEffect(() => {
    if (isNameManuallyEdited) return;
    setFormData((current) =>
      current.name === suggestedName
        ? current
        : { ...current, name: suggestedName },
    );
  }, [isNameManuallyEdited, suggestedName]);

  const isSubmitDisabled =
    !formData.name.trim() ||
    !formData.curriculumId ||
    !formData.teacherId ||
    !formData.gradeCode ||
    !campusId ||
    !academicPeriodId ||
    !academicSettings?.timeZone ||
    (formData.liveAccess.mode === "school" &&
      formData.liveAccess.allowedGradeCodes.length === 0) ||
    weeklySlots.length === 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitDisabled || !campusId) return;
    setIsSubmitting(true);

    try {
      const result = await createCourse({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        curriculumId: formData.curriculumId as Id<"curriculums">,
        teacherId: formData.teacherId as Id<"users">,
        gradeCode: formData.gradeCode,
        liveAccess: formData.liveAccess,
        campusId,
        academicPeriodId: academicPeriodId as Id<"academicPeriods">,
        weeklySlots: weeklySlots.map((slot) => ({
          dayOfWeek: slot.dayOfWeek,
          startMinutes: slot.startMinutes,
          durationMinutes: slot.endMinutes - slot.startMinutes,
          sessionType: slot.sessionType,
        })),
      });
      toast.success(t("class.created"));
      router.push(`/${orgSlug}/classes/${result.classId}`);
    } catch {
      toast.error(t("errors.operationFailed"));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-8">
      <header className="sticky top-[var(--header-height)] z-30 isolate flex items-center justify-between gap-4 py-2 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-z-10 after:h-[calc(100%+2rem)] after:bg-gradient-to-b after:from-background after:via-background/80 after:to-background/0 after:content-['']">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("class.new")}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" type="button" asChild>
            <Link href={`/${orgSlug}/classes`}>{t("common.cancel")}</Link>
          </Button>
          <Button
            type="submit"
            form="create-course-form"
            disabled={isSubmitting || isSubmitDisabled}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("class.createClass")}
          </Button>
        </div>
      </header>

      <form
        id="create-course-form"
        onSubmit={handleSubmit}
        className="space-y-10"
      >
        <section>
          {!campusId && (
            <p className="mb-4 text-sm text-destructive">
              {t("class.selectCampusFirst")}
            </p>
          )}
          <CourseFormFields
            formData={formData}
            setFormDataAction={setFormData}
            curriculums={curriculums}
            teachers={teachers}
            grades={grades}
            isAdmin={isAdmin}
            nameRequired
            primaryFieldsClassName="lg:grid-cols-2"
            curriculumEmptyState={
              <p className="text-sm text-muted-foreground">
                {t("class.noCurriculums")}{" "}
                <Link
                  href={`${settingsBasePath}/curriculums`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("class.manageCurriculums")}
                </Link>
              </p>
            }
            teacherEmptyState={
              <p className="text-sm text-muted-foreground">
                {t("class.noTeachers")}{" "}
                <Link
                  href={`/${orgSlug}/professors`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("class.manageTeachers")}
                </Link>
              </p>
            }
            gradeEmptyState={
              <p className="text-sm text-muted-foreground">
                {t("class.noGrades")}{" "}
                <Link
                  href={settingsBasePath + "/grades"}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("class.configureGrades")}
                </Link>
              </p>
            }
            onNameChangeAction={(name) => {
              setIsNameManuallyEdited(true);
              setFormData((current) => ({ ...current, name }));
            }}
            academicPeriodField={
              <div className="grid gap-2">
                <Label>
                  {t("class.academicPeriod")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={academicPeriodId}
                  onValueChange={setAcademicPeriodId}
                >
                  <SelectTrigger className="w-full bg-sidebar">
                    <SelectValue
                      placeholder={t("class.selectAcademicPeriod")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePeriods.map((period) => (
                      <SelectItem key={period._id} value={period._id}>
                        {period.name} ·{" "}
                        {dateFormatter.format(
                          new Date(`${period.startDate}T00:00:00Z`),
                        )}{" "}
                        –{" "}
                        {dateFormatter.format(
                          new Date(`${period.endDate}T00:00:00Z`),
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {schoolId &&
                  academicSettings &&
                  availablePeriods.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("class.noAcademicPeriods")}{" "}
                      {settingsContext?.canManageInstitution && (
                        <Link
                          href={settingsBasePath + "/academic"}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {t("class.configureAcademicPeriods")}
                        </Link>
                      )}
                    </p>
                  )}
                {!schoolId && (
                  <p className="text-sm text-muted-foreground">
                    {t("class.selectInstitutionFirst")}
                  </p>
                )}
                {schoolId && academicSettings && !academicSettings.timeZone && (
                  <p className="text-sm text-destructive">
                    {t("class.timeZoneRequired")}{" "}
                    {settingsContext?.canManageInstitution && (
                      <Link
                        href={settingsBasePath}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {t("class.configureTimeZone")}
                      </Link>
                    )}
                  </p>
                )}
              </div>
            }
          />
        </section>

        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {t("class.weeklySchedule")}
              {academicSettings?.timeZone && ` · ${academicSettings.timeZone}`}
            </h2>
            <div className="flex items-center gap-2">
              <Switch
                id="show-existing-course-schedules"
                checked={showExistingSchedules}
                onCheckedChange={setShowExistingSchedules}
                disabled={!formData.gradeCode || !academicPeriodId}
              />
              <Label
                htmlFor="show-existing-course-schedules"
                className="cursor-pointer font-normal"
              >
                {t("class.showExistingSchedules")}
              </Label>
            </div>
          </div>
          {academicSettings === undefined ? (
            <Skeleton className="h-96 w-full" />
          ) : academicSettings?.timeZone ? (
            <CourseWeeklyCalendar
              value={weeklySlots}
              onChangeAction={setWeeklySlots}
              courseName={formData.name}
              backgroundSlots={scheduleGuides?.map((guide) => ({
                id: guide.scheduleId,
                dayOfWeek: guide.dayOfWeek,
                startMinutes: guide.startMinutes,
                endMinutes: guide.endMinutes,
                label: guide.className,
              }))}
              startMinutes={academicSettings.scheduleStartMinutes}
              endMinutes={academicSettings.scheduleEndMinutes}
              timeZone={academicSettings.timeZone}
              teacherName={
                teachers?.find((teacher) => teacher._id === formData.teacherId)
                  ?.fullName
              }
            />
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("class.timeZoneRequired")}
            </div>
          )}
        </section>
      </form>
    </div>
  );
}
