"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/table/data-table";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { useRouter } from "@/i18n/navigation";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import { AddStudentDialog } from "./add-student-dialog";

interface StudentManagerProps {
  classId: Id<"classes">;
  canManage?: boolean;
  canViewProfiles?: boolean;
}

type ClassStudent = FunctionReturnType<
  typeof api.classes.getStudents
>[number];

type StudentToRemove = Pick<ClassStudent, "_id" | "fullName">;

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials.toUpperCase() || "?";
}

function StudentPhoto({ student }: { student: ClassStudent }) {
  const [imageError, setImageError] = useState(false);
  const showImage = student.imageUrl && !imageError;

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {showImage ? (
        <Image
          src={student.imageUrl!}
          alt={student.fullName}
          height={40}
          width={40}
          sizes="40px"
          unoptimized
          onError={() => setImageError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-primary text-sm font-semibold text-primary-foreground">
          {getInitials(student.fullName)}
        </div>
      )}
    </div>
  );
}

function StudentCell({ student }: { student: ClassStudent }) {
  return (
    <div className="flex items-center gap-3">
      <StudentPhoto student={student} />
      <div className="min-w-0 flex-1">
        <div className="font-medium whitespace-normal break-words">
          {student.fullName}
        </div>
        {student.email && (
          <div className="truncate text-xs text-muted-foreground">
            {student.email}
          </div>
        )}
      </div>
    </div>
  );
}

export function StudentManager({
  classId,
  canManage = false,
  canViewProfiles = false,
}: StudentManagerProps) {
  const t = useTranslations();
  const router = useRouter();
  const basePath = useOrgBasePath();
  const students = useQuery(api.classes.getStudents, { classId });
  const removeStudent = useMutation(api.classes.removeStudent);
  const [studentToRemove, setStudentToRemove] =
    useState<StudentToRemove | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleConfirmRemove = useCallback(async () => {
    if (!studentToRemove) {
      return;
    }

    setIsRemoving(true);

    try {
      await removeStudent({ classId, studentId: studentToRemove._id });
      toast.success(t("class.studentRemoved"));
      setStudentToRemove(null);
    } catch {
      toast.error(t("errors.operationFailed"));
    } finally {
      setIsRemoving(false);
    }
  }, [classId, removeStudent, studentToRemove, t]);

  const handleRemoveDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setStudentToRemove(null);
    }
  }, []);

  const columns = useMemo<ColumnDef<ClassStudent, unknown>[]>(
    () => [
      createSearchColumn<ClassStudent>(["fullName", "email"]),
      {
        id: "student",
        header: createSortableHeader(t("navigation.student")),
        accessorFn: (row) => row.fullName,
        cell: ({ row }) => <StudentCell student={row.original} />,
      },
      {
        id: "grade",
        accessorFn: (row) => row.gradeName ?? row.gradeCode ?? "",
        header: createSortableHeader(t("student.grade")),
        cell: ({ row }) =>
          row.original.gradeName ?? row.original.gradeCode ?? "-",
      },
      {
        id: "campus",
        accessorFn: (row) => row.campusName ?? "",
        header: createSortableHeader(t("navigation.campus")),
        cell: ({ row }) => row.original.campusName ?? "-",
      },
      {
        accessorKey: "isActive",
        header: createSortableHeader(t("common.status")),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "active" : "inactive"}>
            {row.original.isActive ? t("common.active") : t("common.inactive")}
          </Badge>
        ),
        meta: { className: "hidden md:table-cell" },
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => (
                <div className="text-right">{t("common.actions")}</div>
              ),
              cell: ({ row }) => {
                const student = row.original;

                return (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setStudentToRemove(student)}
                      aria-label={t("student.removeFromClass")}
                      title={t("student.removeFromClass")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              },
            } satisfies ColumnDef<ClassStudent, unknown>,
          ]
        : []),
    ],
    [canManage, t],
  );

  if (students === undefined) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <DataTable
        data={students}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t("common.searchByName")}
        emptyMessage={t("class.noStudents")}
        createAction={
          canManage ? (
            <AddStudentDialog classId={classId} />
          ) : undefined
        }
        onRowClick={
          canViewProfiles
            ? (student) => router.push(`${basePath}/students/${student._id}`)
            : undefined
        }
      />

      {canManage && (
        <AlertDialog
          open={studentToRemove !== null}
          onOpenChange={handleRemoveDialogChange}
        >
          <AlertDialogContent className="sm:max-w-sm">
            <AlertDialogHeader className="items-center text-center sm:items-center sm:text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive dark:bg-destructive/20">
                <Trash2 className="h-5 w-5" />
              </div>
              <AlertDialogTitle>
                {t("student.removeFromClassTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {studentToRemove
                  ? t("class.removeConfirm", { name: studentToRemove.fullName })
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="items-center justify-center gap-2 sm:justify-center">
              <AlertDialogCancel disabled={isRemoving}>
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isRemoving}
                className={buttonVariants({ variant: "destructive" })}
                onClick={(event) => {
                  event.preventDefault();
                  void handleConfirmRemove();
                }}
              >
                {t("student.removeFromClassAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
