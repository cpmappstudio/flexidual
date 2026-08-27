"use client";

import { useEffect, useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type CourseCreationStudent = FunctionReturnType<
  typeof api.classes.listCourseCreationGradeStudents
>[number];

interface CourseEnrollmentReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (studentIds: Id<"users">[]) => void;
  curriculumId: Id<"curriculums">;
  campusId: Id<"campuses">;
  gradeCode: string;
  gradeName: string;
  grades: Array<{ code: string; name: string }>;
  courseName: string;
  isSubmitting: boolean;
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function StudentIdentity({ student }: { student: CourseCreationStudent }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar size="lg" className="border">
        <AvatarImage src={student.imageUrl} alt={student.fullName} />
        <AvatarFallback>{getInitials(student.fullName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{student.fullName}</p>
        {student.email && (
          <p className="truncate text-xs text-muted-foreground">
            {student.email}
          </p>
        )}
      </div>
    </div>
  );
}

function StudentMetadata({
  student,
  gradeName,
}: {
  student: CourseCreationStudent;
  gradeName: string;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{gradeName}</Badge>
      <Badge variant={student.isActive ? "active" : "inactive"}>
        {t(student.isActive ? "common.active" : "common.inactive")}
      </Badge>
    </div>
  );
}

export function CourseEnrollmentReviewDialog({
  open,
  onOpenChange,
  onConfirm,
  curriculumId,
  campusId,
  gradeCode,
  gradeName,
  grades,
  courseName,
  isSubmitting,
}: CourseEnrollmentReviewDialogProps) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const [initializedGradeCode, setInitializedGradeCode] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<
    Map<Id<"users">, CourseCreationStudent>
  >(new Map());
  const gradeStudents = useQuery(
    api.classes.listCourseCreationGradeStudents,
    open ? { curriculumId, campusId, gradeCode } : "skip",
  );
  const searchResults = useQuery(
    api.classes.searchCourseCreationStudents,
    open && debouncedSearch.length >= 2
      ? { curriculumId, campusId, searchQuery: debouncedSearch }
      : "skip",
  );

  useEffect(() => {
    if (!open || !gradeStudents || initializedGradeCode === gradeCode) return;
    setSelectedStudents(
      new Map(gradeStudents.map((student) => [student._id, student])),
    );
    setInitializedGradeCode(gradeCode);
  }, [gradeCode, gradeStudents, initializedGradeCode, open]);

  const selected = useMemo(
    () =>
      [...selectedStudents.values()].sort((a, b) =>
        a.fullName.localeCompare(b.fullName),
      ),
    [selectedStudents],
  );
  const isRosterReady =
    gradeStudents !== undefined && initializedGradeCode === gradeCode;
  const availableResults = (searchResults ?? []).filter(
    (student) => !selectedStudents.has(student._id),
  );
  const gradeLabels = useMemo(() => {
    return new Map(grades.map((grade) => [grade.code, grade.name]));
  }, [grades]);
  const getGradeName = (student: CourseCreationStudent) =>
    student.gradeCode
      ? (gradeLabels.get(student.gradeCode) ?? student.gradeCode)
      : t("class.enrollmentReview.noGrade");

  const addStudent = (student: CourseCreationStudent) => {
    setSelectedStudents((current) => {
      const next = new Map(current);
      next.set(student._id, student);
      return next;
    });
  };
  const removeStudent = (studentId: Id<"users">) => {
    setSelectedStudents((current) => {
      const next = new Map(current);
      next.delete(studentId);
      return next;
    });
  };
  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (!nextOpen) setSearch("");
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onEscapeKeyDown={(event) => isSubmitting && event.preventDefault()}
        onInteractOutside={(event) => isSubmitting && event.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>{t("class.enrollmentReview.title")}</DialogTitle>
          <DialogDescription>
            {t("class.enrollmentReview.description")}
          </DialogDescription>
          <p className="text-sm font-medium text-foreground">
            {courseName} · {gradeName}
          </p>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto p-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">
                {t("class.enrollmentReview.addStudents")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("class.enrollmentReview.searchHelp")}
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("class.enrollmentReview.searchPlaceholder")}
                className="pl-9"
                disabled={isSubmitting}
              />
            </div>

            {debouncedSearch.length >= 2 && (
              <div className="rounded-lg border bg-muted/20">
                {searchResults === undefined ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : availableResults.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("student.noResults")}
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto">
                    <div className="divide-y">
                      {availableResults.map((student) => (
                        <div
                          key={student._id}
                          className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 space-y-2">
                            <StudentIdentity student={student} />
                            <StudentMetadata
                              student={student}
                              gradeName={getGradeName(student)}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addStudent(student)}
                            disabled={isSubmitting}
                          >
                            <Plus className="size-4" />
                            {t("common.add")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold">
                {t("class.enrollmentReview.studentsToEnroll")}
              </h3>
              <Badge variant="secondary">
                {t("class.enrollmentReview.selectedCount", {
                  count: selected.length,
                })}
              </Badge>
            </div>

            {!isRosterReady ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : selected.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("class.enrollmentReview.noSelectedStudents")}
                </p>
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {selected.map((student) => (
                  <div
                    key={student._id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-2">
                      <StudentIdentity student={student} />
                      <StudentMetadata
                        student={student}
                        gradeName={getGradeName(student)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeStudent(student._id)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="size-4" />
                      {t("student.removeFromClassAction")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground sm:max-w-xs">
            {selected.length === 0
              ? t("class.enrollmentReview.createWithoutStudentsDescription")
              : t("class.enrollmentReview.confirmationDescription")}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("class.enrollmentReview.backToCourse")}
            </Button>
            <Button
              type="button"
              onClick={() => onConfirm([...selectedStudents.keys()])}
              disabled={isSubmitting || !isRosterReady}
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting
                ? t("class.enrollmentReview.creating")
                : selected.length === 0
                  ? t("class.enrollmentReview.createWithoutStudents")
                  : t("class.enrollmentReview.createAndEnroll", {
                      count: selected.length,
                    })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
