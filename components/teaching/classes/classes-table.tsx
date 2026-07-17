"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { Doc } from "@/convex/_generated/dataModel";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ClassDialog } from "./class-dialog";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getRoleForOrg } from "@/lib/rbac";
import { DataTable } from "@/components/table/data-table";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import { useRouter } from "@/i18n/navigation";
import { Edit, Presentation } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";

interface ClassesTableProps {
  data: Doc<"classes">[];
  curriculums?: Doc<"curriculums">[];
  customFilter?: React.ReactNode;
}

export function ClassesTable({
  data,
  curriculums,
  customFilter,
}: ClassesTableProps) {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params.orgSlug as string) || "system";
  const { sessionClaims } = useAuth();
  const role = getRoleForOrg(sessionClaims, orgSlug);
  const isAdmin =
    role === "admin" || role === "principal" || role === "superadmin";
  const teachers = useQuery(api.users.getTeachers, isAdmin ? {} : "skip");

  const [editingClass, setEditingClass] = React.useState<Doc<"classes"> | null>(
    null,
  );

  const getCurriculumName = (id: string) => {
    return (
      curriculums?.find((c) => c._id === id)?.title || "Unknown Curriculum"
    );
  };

  const getTeacher = (id?: string) => {
    return teachers?.find((teacher) => teacher._id === id);
  };

  const getTeacherName = (classDoc: Doc<"classes">) => {
    const teacher = getTeacher(classDoc.teacherId);
    return teacher?.fullName || "";
  };

  const renderTeacher = (classDoc: Doc<"classes">) => {
    const teacher = getTeacher(classDoc.teacherId);

    if (!teacher) {
      return null;
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

  const renderMobileCard = (classDoc: Doc<"classes">) => {
    const teacherName = getTeacherName(classDoc);

    return (
      <Card className="group relative h-full gap-0 overflow-hidden rounded-md border-primary/10 py-0 shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-orange-500/5 to-transparent" />
        <Presentation className="pointer-events-none absolute -right-5 -top-5 h-28 w-28 text-primary/10 transition-transform group-hover:scale-105" />
        <CardContent className="relative flex h-full flex-col p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-base font-semibold leading-snug whitespace-normal">
                {classDoc.name}
              </h3>
              <div className="mt-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  {t("navigation.curriculum")}
                </div>
                <p className="mt-0.5 break-words text-sm text-muted-foreground whitespace-normal">
                  {getCurriculumName(classDoc.curriculumId)}
                </p>
              </div>
            </div>

            {isAdmin && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 bg-background/90"
                title={t("class.edit")}
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingClass(classDoc);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="mt-auto grid grid-cols-2 gap-3 pt-5 text-sm">
            {isAdmin && teacherName && (
              <div className="col-span-2 min-w-0">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  {t("navigation.teacher")}
                </div>
                <div className="mt-1 min-w-0">{renderTeacher(classDoc)}</div>
              </div>
            )}

            <div className="min-w-0">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                {t("navigation.students")}
              </div>
              <div className="mt-1 font-medium">
                {classDoc.students?.length || 0}
              </div>
            </div>

            <div className="min-w-0">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                {t("class.academicYear")}
              </div>
              <div className="mt-1 break-words font-medium whitespace-normal">
                {classDoc.academicYear || "-"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const classHeader = (
    <>
      <span className="hidden lg:block">{t("common.name")}</span>
      <span className="lg:hidden">{t("class.class")}</span>
    </>
  );

  const columns: ColumnDef<Doc<"classes">, unknown>[] = [
    {
      ...createSearchColumn<Doc<"classes">>(["name"]),
      accessorFn: (row) =>
        [
          row.name,
          getCurriculumName(row.curriculumId),
          isAdmin ? getTeacherName(row) : "",
          row.academicYear,
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
            {isAdmin && getTeacherName(row.original) && (
              <div className="inline-flex items-center text-xs">
                <span className="font-mono">{t("navigation.teacher")}:</span>
                <span className="break-words text-muted-foreground whitespace-normal">
                  {getTeacherName(row.original)}
                </span>
              </div>
            )}
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("class.academicYear")}:</span>
              <span className="text-muted-foreground">
                {row.original.academicYear || "-"}
              </span>
            </div>
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("navigation.students")}:</span>
              <span className="text-muted-foreground">
                {row.original.students?.length || 0}
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
    ...(isAdmin
      ? [
          {
            id: "teacher",
            accessorFn: (row: Doc<"classes">) => getTeacherName(row),
            header: createSortableHeader(t("navigation.teacher")),
            meta: { className: "hidden lg:table-cell" },
            cell: ({ row }: { row: { original: Doc<"classes"> } }) =>
              renderTeacher(row.original),
          } satisfies ColumnDef<Doc<"classes">, unknown>,
        ]
      : []),
    {
      id: "students",
      accessorFn: (row) => row.students?.length || 0,
      header: createSortableHeader(t("navigation.students")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          {row.original.students?.length || 0}
        </div>
      ),
    },
    {
      accessorKey: "academicYear",
      header: createSortableHeader(t("class.academicYear")),
      meta: { className: "hidden xl:table-cell" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          {row.original.academicYear || "-"}
        </div>
      ),
    },
    // Edit action column — admins only
    ...(isAdmin
      ? ([
          {
            id: "actions",
            cell: ({ row }: { row: { original: Doc<"classes"> } }) => (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  title={t("class.edit")}
                  onClick={(e) => {
                    e.stopPropagation(); // prevent row click from also firing
                    setEditingClass(row.original);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ] as ColumnDef<Doc<"classes">, unknown>[])
      : []),
  ];

  return (
    <div className="space-y-4">
      {editingClass && (
        <ClassDialog
          classDoc={editingClass}
          open={true}
          onOpenChange={(open) => !open && setEditingClass(null)}
          trigger={<span className="hidden" />}
        />
      )}

      <DataTable
        data={data}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t("common.searchByName")}
        emptyMessage={t("common.noResults")}
        customFilter={customFilter}
        createAction={isAdmin ? <ClassDialog /> : undefined}
        renderMobileCard={renderMobileCard}
        pageSize={10}
        onRowClick={(cls) => router.push(`/${orgSlug}/classes/${cls._id}`)}
      />
    </div>
  );
}
