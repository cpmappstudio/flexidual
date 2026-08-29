"use client";

import * as React from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/table/data-table";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import { Link, useRouter } from "@/i18n/navigation";
import { Edit, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useOrgBasePath } from "@/hooks/use-org-base-path";

interface ClassesTableProps {
  data: ClassTableRow[];
  curriculums?: Doc<"curriculums">[];
  grades?: Doc<"institutionGrades">[];
  academicPeriods?: Doc<"academicPeriods">[];
  teachers?: {
    _id: Id<"users">;
    fullName: string;
    email?: string;
    imageUrl?: string;
  }[];
  customFilter?: React.ReactNode;
  canManage?: boolean;
}

type ClassTableRow = Doc<"classes"> & { studentCount: number };

export function ClassesTable({
  data,
  curriculums,
  grades,
  academicPeriods,
  teachers,
  customFilter,
  canManage = false,
}: ClassesTableProps) {
  const t = useTranslations();
  const router = useRouter();
  const basePath = useOrgBasePath();

  const getCurriculumName = (id: string) => {
    return (
      curriculums?.find((c) => c._id === id)?.title || "Unknown Curriculum"
    );
  };

  const getTeacher = (id?: string) => {
    return teachers?.find((teacher) => teacher._id === id);
  };

  const getGradeName = (code?: string) =>
    grades?.find((grade) => grade.code === code)?.name || code || "-";

  const getAcademicPeriodName = (id?: Id<"academicPeriods">) =>
    academicPeriods?.find((period) => period._id === id)?.name || "-";

  const getClassTypeLabel = (classDoc: Doc<"classes">) => {
    if (classDoc.classType === "ignitia") return "Ignitia";
    if (classDoc.classType === "abeka") return "Abeka";
    if (classDoc.classType === "standard") return "Standard";
    return classDoc.teacherId ? "Standard" : "";
  };

  const getTeacherOrTypeLabel = (classDoc: Doc<"classes">) => {
    const teacher = getTeacher(classDoc.teacherId);
    return teacher?.fullName || getClassTypeLabel(classDoc) || "-";
  };

  const renderTeacher = (classDoc: Doc<"classes">) => {
    const teacher = getTeacher(classDoc.teacherId);
    const fallbackLabel = getClassTypeLabel(classDoc);

    if (!teacher) {
      return (
        <span className="text-sm text-muted-foreground">
          {fallbackLabel || "-"}
        </span>
      );
    }

    const initials = teacher.fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();

    return (
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7">
          {teacher.imageUrl && (
            <AvatarImage
              className="object-cover"
              src={teacher.imageUrl}
              alt={teacher.fullName}
            />
          )}
          <AvatarFallback className="text-xs">{initials || "T"}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 break-words text-sm font-medium whitespace-normal">
          {teacher.fullName}
        </span>
      </div>
    );
  };

  const classHeader = (
    <>
      <span className="hidden lg:block">{t("common.name")}</span>
      <span className="lg:hidden">{t("class.class")}</span>
    </>
  );

  const columns: ColumnDef<ClassTableRow, unknown>[] = [
    {
      ...createSearchColumn<ClassTableRow>(["name"]),
      accessorFn: (row) =>
        [
          row.name,
          getCurriculumName(row.curriculumId),
          getGradeName(row.gradeCode),
          getTeacherOrTypeLabel(row),
          getAcademicPeriodName(row.academicPeriodId),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
    },
    {
      accessorKey: "name",
      header: createSortableHeader(classHeader),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="break-words font-medium whitespace-normal">
            {row.getValue("name")}
          </div>
          <div className="lg:hidden flex flex-col gap-0.5 mt-1">
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("navigation.curriculum")}:</span>
              <span className="break-words text-muted-foreground whitespace-normal">
                {getCurriculumName(row.original.curriculumId)}
              </span>
            </div>
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("class.grade")}:</span>
              <span className="break-words text-muted-foreground whitespace-normal">
                {getGradeName(row.original.gradeCode)}
              </span>
            </div>
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("navigation.teacher")}:</span>
              <span className="break-words text-muted-foreground whitespace-normal">
                {getTeacherOrTypeLabel(row.original)}
              </span>
            </div>
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("class.academicPeriod")}:</span>
              <span className="text-muted-foreground">
                {getAcademicPeriodName(row.original.academicPeriodId)}
              </span>
            </div>
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("navigation.students")}:</span>
              <span className="text-muted-foreground">
                {row.original.studentCount}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "curriculumId",
      header: createSortableHeader(t("class.curriculum")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <span className="break-words whitespace-normal">
          {getCurriculumName(row.getValue("curriculumId"))}
        </span>
      ),
    },
    {
      id: "grade",
      accessorFn: (row) => getGradeName(row.gradeCode),
      header: createSortableHeader(t("class.grade")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <span className="break-words whitespace-normal">
          {getGradeName(row.original.gradeCode)}
        </span>
      ),
    },
    {
      id: "teacher",
      accessorFn: (row: ClassTableRow) => getTeacherOrTypeLabel(row),
      header: createSortableHeader(t("navigation.teacher")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }: { row: { original: ClassTableRow } }) =>
        renderTeacher(row.original),
    },
    {
      id: "students",
      accessorFn: (row) => row.studentCount,
      header: createSortableHeader(t("navigation.students")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          {row.original.studentCount}
        </div>
      ),
    },
    {
      id: "academicPeriod",
      accessorFn: (row) => getAcademicPeriodName(row.academicPeriodId),
      header: createSortableHeader(t("class.academicPeriod")),
      meta: { className: "hidden xl:table-cell" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          {getAcademicPeriodName(row.original.academicPeriodId)}
        </div>
      ),
    },
    // Edit action column — admins only
    ...(canManage
      ? ([
          {
            id: "actions",
            cell: ({ row }: { row: { original: ClassTableRow } }) => (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  title={t("class.edit")}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(
                      `${basePath}/classes/new?edit=${row.original._id}`,
                    );
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ] as ColumnDef<ClassTableRow, unknown>[])
      : []),
  ];

  return (
    <div className="space-y-4">
      <DataTable
        data={data}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t("common.searchByName")}
        emptyMessage={t("common.noResults")}
        customFilter={customFilter}
        createAction={
          canManage ? (
            <Button asChild>
              <Link
                href={`${basePath}/classes/new`}
                aria-label={t("class.createClass")}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t("class.createClass")}
                </span>
              </Link>
            </Button>
          ) : undefined
        }
        onRowClick={(cls) => router.push(`${basePath}/classes/${cls._id}`)}
      />
    </div>
  );
}
