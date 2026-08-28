"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2, Trash2 } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
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
import { CourseEnrollmentReviewDialog } from "@/components/teaching/classes/course-enrollment-review-dialog";
import { TeacherScheduleShareAlertDialog } from "@/components/teaching/classes/teacher-schedule-share-alert-dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { Link, useRouter } from "@/i18n/navigation";
import { todayInTimeZone } from "@/lib/time-zone";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { useAlert } from "@/components/providers/alert-provider";
import {
  getErrorMessage,
  parseConvexError,
  type TeacherScheduleConflictDetails,
} from "@/lib/error-utils";
import {
  getRemovedWeeklyScheduleSlots,
  hasAcademicPeriodStarted,
  requiresWeeklySlotRemovalConfirmation,
} from "@/lib/course-schedule-change";

type CourseDetails = NonNullable<FunctionReturnType<typeof api.classes.get>>;

function CourseEditorSkeleton() {
  return (
    <div className="w-full space-y-8">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}

export default function CreateCoursePage() {
  const t = useTranslations();
  const params = useParams();
  const searchParams = useSearchParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const editClassId = searchParams.get("edit");
  const classToEdit = useQuery(
    api.classes.get,
    editClassId ? { id: editClassId as Id<"classes"> } : "skip",
  );

  if (editClassId && classToEdit === undefined) {
    return <CourseEditorSkeleton />;
  }
  if (editClassId && classToEdit === null) {
    return <div className="p-6">{t("class.notFound")}</div>;
  }

  return (
    <CourseEditor
      key={classToEdit?._id ?? "new-course"}
      orgSlug={orgSlug}
      classToEdit={classToEdit ?? undefined}
    />
  );
}

function CourseEditor({
  orgSlug,
  classToEdit,
}: {
  orgSlug: string;
  classToEdit?: CourseDetails;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { showAlert } = useAlert();
  const isEditing = Boolean(classToEdit);
  const { access, isLoading: isAccessLoading } = useStaffAccess();
  const isAdmin = access?.canManageCampus ?? false;
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });
  const { context: settingsContext, basePath: settingsBasePath } =
    useSettingsContext();
  const schoolId = classToEdit?.schoolId ?? settingsContext?.institution._id;
  const campusId =
    classToEdit?.campusId ??
    (orgContext?.type === "campus"
      ? (orgContext._id as Id<"campuses">)
      : undefined);
  const curriculums = useQuery(
    api.curriculums.list,
    isAdmin && schoolId ? { includeInactive: isEditing, schoolId } : "skip",
  );
  const teachers = useQuery(
    api.users.getUsers,
    isAdmin && campusId
      ? {
          roles: ["teacher", "principal"],
          isActive: true,
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
  const updateCourse = useMutation(api.classes.update);
  const deleteCourse = useMutation(api.classes.remove);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEnrollmentReviewOpen, setIsEnrollmentReviewOpen] = useState(false);
  const [pendingScheduleShare, setPendingScheduleShare] = useState<{
    studentIds: Id<"users">[];
    conflicts: TeacherScheduleConflictDetails[];
  }>();
  const [approvedScheduleShareIds, setApprovedScheduleShareIds] = useState<
    Id<"classes">[]
  >([]);
  const [pendingWeeklySlotRemoval, setPendingWeeklySlotRemoval] =
    useState<CourseWeeklySlot>();
  const [scheduleCancellationReason, setScheduleCancellationReason] =
    useState("");
  const [academicPeriodId, setAcademicPeriodId] = useState(
    classToEdit?.academicPeriodId ?? "",
  );
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(isEditing);
  const [showExistingSchedules, setShowExistingSchedules] = useState(true);
  const [weeklySlots, setWeeklySlots] = useState<CourseWeeklySlot[]>(() =>
    (classToEdit?.weeklySlots ?? []).map((slot, index) => ({
      id: `existing-${index}-${slot.dayOfWeek}-${slot.startMinutes}`,
      dayOfWeek: slot.dayOfWeek,
      startMinutes: slot.startMinutes,
      endMinutes: slot.startMinutes + slot.durationMinutes,
      sessionType: slot.sessionType,
    })),
  );
  const [formData, setFormData] = useState<CourseFormData>({
    name: classToEdit?.name ?? "",
    description: classToEdit?.description ?? "",
    curriculumId: classToEdit?.curriculumId ?? "",
    teacherId: classToEdit?.teacherId ?? "",
    gradeCode: classToEdit?.gradeCode ?? "",
    liveAccess: classToEdit?.liveAccess ?? {
      mode: "private",
      allowedGradeCodes: [],
    },
  });
  const scheduleGuides = useQuery(
    api.classes.listWeeklyScheduleGuides,
    isAdmin &&
      campusId &&
      academicPeriodId &&
      formData.gradeCode &&
      (!isEditing || classToEdit)
      ? {
          campusId,
          academicPeriodId: academicPeriodId as Id<"academicPeriods">,
          gradeCode: formData.gradeCode,
          ...(formData.teacherId
            ? { teacherId: formData.teacherId as Id<"users"> }
            : {}),
          excludeClassId: classToEdit?._id,
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
    return academicSettings.periods.filter(
      (period) =>
        period.endDate >= today ||
        (isEditing && period._id === classToEdit?.academicPeriodId),
    );
  }, [academicSettings, classToEdit?.academicPeriodId, isEditing]);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
    [locale],
  );
  const selectedAcademicPeriod = availablePeriods.find(
    (period) => period._id === academicPeriodId,
  );
  const selectedAcademicPeriodLabel = selectedAcademicPeriod
    ? `${selectedAcademicPeriod.name} · ${dateFormatter.format(
        new Date(`${selectedAcademicPeriod.startDate}T00:00:00Z`),
      )} – ${dateFormatter.format(
        new Date(`${selectedAcademicPeriod.endDate}T00:00:00Z`),
      )}`
    : classToEdit?.academicYear;
  const selectedGradeName =
    grades?.find((grade) => grade.code === formData.gradeCode)?.name ??
    formData.gradeCode;
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

  const weeklySlotConfigs = useMemo(
    () =>
      weeklySlots.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        startMinutes: slot.startMinutes,
        durationMinutes: slot.endMinutes - slot.startMinutes,
        sessionType: slot.sessionType,
      })),
    [weeklySlots],
  );
  const removedWeeklySlots = useMemo(
    () =>
      getRemovedWeeklyScheduleSlots(
        classToEdit?.weeklySlots ?? [],
        weeklySlotConfigs,
      ),
    [classToEdit?.weeklySlots, weeklySlotConfigs],
  );
  const requiresScheduleCancellationReason = Boolean(
    isEditing &&
      removedWeeklySlots.length > 0 &&
      selectedAcademicPeriod &&
      academicSettings?.timeZone &&
      hasAcademicPeriodStarted(
        selectedAcademicPeriod.startDate,
        academicSettings.timeZone,
      ),
  );

  const removingSlotRequiresCancellation = (slot: CourseWeeklySlot) =>
    requiresWeeklySlotRemovalConfirmation({
      slot: {
        dayOfWeek: slot.dayOfWeek,
        startMinutes: slot.startMinutes,
        durationMinutes: slot.endMinutes - slot.startMinutes,
        sessionType: slot.sessionType,
      },
      originalSlots: classToEdit?.weeklySlots ?? [],
      periodStartDate: selectedAcademicPeriod?.startDate,
      timeZone: academicSettings?.timeZone,
      isEditing,
    });

  const removeWeeklySlot = (slot: CourseWeeklySlot) => {
    if (removingSlotRequiresCancellation(slot)) {
      setPendingWeeklySlotRemoval(slot);
      return;
    }
    setWeeklySlots((current) =>
      current.filter((candidate) => candidate.id !== slot.id),
    );
  };

  const confirmWeeklySlotRemoval = () => {
    if (!pendingWeeklySlotRemoval) return;
    setWeeklySlots((current) =>
      current.filter(
        (candidate) => candidate.id !== pendingWeeklySlotRemoval.id,
      ),
    );
    setPendingWeeklySlotRemoval(undefined);
  };

  useEffect(() => {
    if (isEditing) return;
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
  }, [
    academicPeriodId,
    academicSettings?.timeZone,
    availablePeriods,
    isEditing,
  ]);

  useEffect(() => {
    if (isEditing || isNameManuallyEdited) return;
    setFormData((current) =>
      current.name === suggestedName
        ? current
        : { ...current, name: suggestedName },
    );
  }, [isEditing, isNameManuallyEdited, suggestedName]);

  const isSubmitDisabled =
    !formData.name.trim() ||
    !formData.curriculumId ||
    !formData.teacherId ||
    !formData.gradeCode ||
    !campusId ||
    (formData.liveAccess.mode === "school" &&
      formData.liveAccess.allowedGradeCodes.length === 0) ||
    !academicPeriodId ||
    !academicSettings?.timeZone ||
    (!isEditing && weeklySlots.length === 0) ||
    (isEditing && !classToEdit);

  const persistCourse = async (
    studentIds: Id<"users">[] = [],
    additionalApprovedScheduleShareIds: Id<"classes">[] = [],
  ) => {
    if (isSubmitDisabled || !campusId) return;
    setIsSubmitting(true);
    const effectiveApprovedScheduleShareIds = [
      ...new Set([
        ...approvedScheduleShareIds,
        ...additionalApprovedScheduleShareIds,
      ]),
    ];
    const scheduleShareApproval =
      effectiveApprovedScheduleShareIds.length > 0
        ? { approvedScheduleShareIds: effectiveApprovedScheduleShareIds }
        : {};

    try {
      if (isEditing && classToEdit) {
        await updateCourse({
          classId: classToEdit._id,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          curriculumId: formData.curriculumId as Id<"curriculums">,
          teacherId: formData.teacherId as Id<"users">,
          gradeCode: formData.gradeCode,
          liveAccess: formData.liveAccess,
          weeklySlots: weeklySlotConfigs,
          scheduleCancellationReason: requiresScheduleCancellationReason
            ? scheduleCancellationReason.trim() || undefined
            : undefined,
          ...scheduleShareApproval,
        });
        toast.success(t("class.updated"));
        router.push(`/${orgSlug}/classes/${classToEdit._id}`);
        return;
      }

      const result = await createCourse({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        curriculumId: formData.curriculumId as Id<"curriculums">,
        teacherId: formData.teacherId as Id<"users">,
        gradeCode: formData.gradeCode,
        studentIds,
        liveAccess: formData.liveAccess,
        campusId,
        academicPeriodId: academicPeriodId as Id<"academicPeriods">,
        weeklySlots: weeklySlotConfigs,
        ...scheduleShareApproval,
      });
      toast.success(t("class.created"));
      router.push(`/${orgSlug}/classes/${result.classId}`);
    } catch (error: unknown) {
      const parsedError = parseConvexError(error);
      if (
        parsedError?.code === "TEACHER_SCHEDULE_CONFLICT" &&
        parsedError.canShare &&
        parsedError.conflicts?.length
      ) {
        setIsEnrollmentReviewOpen(false);
        setPendingScheduleShare({
          studentIds,
          conflicts: parsedError.conflicts,
        });
        setIsSubmitting(false);
        return;
      }
      toast.error(
        parsedError
          ? getErrorMessage(parsedError, t, locale)
          : t("errors.operationFailed"),
      );
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      requiresScheduleCancellationReason &&
      scheduleCancellationReason.trim().length === 0
    ) {
      toast.error(t("schedule.cancellationReasonRequired"));
      return;
    }
    if (isEditing) {
      void persistCourse();
      return;
    }
    setIsEnrollmentReviewOpen(true);
  };

  const handleDelete = () => {
    if (!classToEdit) return;
    showAlert({
      title: t("common.delete"),
      description: t("class.deleteConfirm"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteCourse({ id: classToEdit._id });
          toast.success(t("class.deleted"));
          router.push(`/${orgSlug}/classes`);
        } catch (error: unknown) {
          const parsedError = parseConvexError(error);
          toast.error(
            parsedError
              ? getErrorMessage(parsedError, t, locale)
              : t("errors.operationFailed"),
          );
        }
      },
    });
  };

  const isEditFormLoading =
    isEditing &&
    (curriculums === undefined ||
      teachers === undefined ||
      academicSettings === undefined ||
      grades === undefined);

  if (isEditFormLoading) {
    return <CourseEditorSkeleton />;
  }

  return (
    <div className="w-full space-y-8">
      <header className="sticky top-[var(--header-height)] z-30 isolate flex flex-col items-stretch justify-between gap-4 py-2 sm:flex-row sm:items-center after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-z-10 after:h-[calc(100%+2rem)] after:bg-gradient-to-b after:from-background after:via-background/80 after:to-background/0 after:content-['']">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {t(isEditing ? "class.edit" : "class.new")}
        </h1>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex shrink-0 items-center gap-2">
            {isEditing && (
              <Button
                variant="outline"
                type="button"
                size="icon"
                onClick={handleDelete}
                className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={t("common.delete")}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}
            <Button variant="outline" type="button" asChild>
              <Link
                href={
                  classToEdit
                    ? `/${orgSlug}/classes/${classToEdit._id}`
                    : `/${orgSlug}/classes`
                }
              >
                {t("common.cancel")}
              </Link>
            </Button>
            <Button
              type="submit"
              form="course-form"
              disabled={isSubmitting || isSubmitDisabled}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t(
                isEditing
                  ? "common.saveChanges"
                  : "class.enrollmentReview.continue",
              )}
            </Button>
          </div>
          {!isEditing && (
            <p className="max-w-md text-right text-xs text-muted-foreground">
              {t("class.enrollmentReview.formHint")}
            </p>
          )}
        </div>
      </header>

      <form id="course-form" onSubmit={handleSubmit} className="space-y-10">
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
            selectedLabels={
              classToEdit
                ? {
                    curriculum: classToEdit.curriculumTitle,
                    teacher: classToEdit.teacherName,
                    grade: classToEdit.gradeName,
                  }
                : undefined
            }
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
                  disabled={isEditing}
                >
                  <SelectTrigger className="w-full bg-sidebar">
                    <SelectValue placeholder={t("class.selectAcademicPeriod")}>
                      {selectedAcademicPeriodLabel}
                    </SelectValue>
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
            <div>
              <h2 className="text-xl font-semibold">
                {t("class.weeklySchedule")}
                {academicSettings?.timeZone &&
                  ` · ${academicSettings.timeZone}`}
              </h2>
              {isEditing && (
                <p className="text-sm text-muted-foreground">
                  {t("class.scheduleChangesFutureOnly")}
                </p>
              )}
            </div>
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
              onRemoveAction={removeWeeklySlot}
              courseName={formData.name}
              backgroundSlots={
                showExistingSchedules
                  ? scheduleGuides
                      ?.filter(
                        (guide) => guide.gradeCode === formData.gradeCode,
                      )
                      .map((guide) => ({
                        id: guide.scheduleId,
                        dayOfWeek: guide.dayOfWeek,
                        startMinutes: guide.startMinutes,
                        endMinutes: guide.endMinutes,
                        label: guide.className,
                        sessionType: guide.sessionType,
                      }))
                  : []
              }
              teacherConflictSlots={scheduleGuides
                ?.filter(
                  (guide) =>
                    guide.isTeacherCourse && guide.sessionType === "live",
                )
                .map((guide) => ({
                  id: guide.scheduleId,
                  classId: guide.classId,
                  dayOfWeek: guide.dayOfWeek,
                  startMinutes: guide.startMinutes,
                  endMinutes: guide.endMinutes,
                  label: guide.className,
                  sessionType: guide.sessionType,
                  gradeName:
                    grades?.find((grade) => grade.code === guide.gradeCode)
                      ?.name || guide.gradeCode,
                  canShare: guide.canShare,
                  isApproved:
                    guide.isScheduleShared ||
                    approvedScheduleShareIds.includes(guide.classId),
                }))}
              onApproveScheduleSharesAction={(classIds) =>
                setApprovedScheduleShareIds((current) => [
                  ...new Set([...current, ...(classIds as Id<"classes">[])]),
                ])
              }
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

      {!isEditing &&
        campusId &&
        formData.curriculumId &&
        formData.gradeCode &&
        grades && (
          <CourseEnrollmentReviewDialog
            open={isEnrollmentReviewOpen}
            onOpenChange={setIsEnrollmentReviewOpen}
            onConfirm={(studentIds) => void persistCourse(studentIds)}
            curriculumId={formData.curriculumId as Id<"curriculums">}
            campusId={campusId}
            gradeCode={formData.gradeCode}
            gradeName={selectedGradeName}
            grades={grades.map((grade) => ({
              code: grade.code,
              name: grade.name,
            }))}
            courseName={formData.name.trim()}
            isSubmitting={isSubmitting}
          />
        )}

      <TeacherScheduleShareAlertDialog
        open={Boolean(pendingScheduleShare)}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setPendingScheduleShare(undefined);
        }}
        teacherName={
          teachers?.find((teacher) => teacher._id === formData.teacherId)
            ?.fullName ?? t("navigation.teacher")
        }
        conflicts={
          pendingScheduleShare?.conflicts.map((conflict) => ({
            id: conflict.classId,
            name: conflict.className,
            detail: `${
              grades?.find((grade) => grade.code === conflict.gradeCode)
                ?.name || conflict.gradeCode
            } · ${new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: academicSettings?.timeZone,
            }).format(new Date(Number(conflict.conflictTime)))}`,
          })) ?? []
        }
        isConfirming={isSubmitting}
        onConfirm={() => {
          if (!pendingScheduleShare) return;
          const pending = pendingScheduleShare;
          setPendingScheduleShare(undefined);
          void persistCourse(
            pending.studentIds,
            pending.conflicts.map(
              (conflict) => conflict.classId as Id<"classes">,
            ),
          );
        }}
      />

      <AlertDialog
        open={Boolean(pendingWeeklySlotRemoval)}
        onOpenChange={(open) => {
          if (!open) setPendingWeeklySlotRemoval(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("class.cancelFutureClassesTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("class.cancelFutureClassesDescription", {
                count: 1,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="schedule-cancellation-reason">
              {t("schedule.cancellationReason")}
            </Label>
            <Textarea
              id="schedule-cancellation-reason"
              value={scheduleCancellationReason}
              onChange={(event) =>
                setScheduleCancellationReason(event.target.value)
              }
              placeholder={t("schedule.cancellationReasonPlaceholder")}
              aria-invalid={
                Boolean(pendingWeeklySlotRemoval) &&
                scheduleCancellationReason.trim().length === 0
              }
            />
            <p className="text-sm text-muted-foreground">
              {t("class.cancelFutureClassesHelp")}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.back")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={scheduleCancellationReason.trim().length === 0}
              onClick={confirmWeeklySlotRemoval}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("class.confirmWeeklyBlockRemoval")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
