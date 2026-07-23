"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getImageFallbackLabel } from "@/lib/files/image";
import type { FlexidualCourseStudent } from "@/modules/liveClasses/lib/flexidual-course-types";
import {
  TableActionsCell,
  TableActionsMenuButton,
  TableStateRow,
  TableSurface,
} from "@/components/tables/table-primitives";

type StudentRosterActionsMenuProps = {
  student: FlexidualCourseStudent;
};

type FlexidualCourseStudentsTableProps = {
  students: ReadonlyArray<FlexidualCourseStudent>;
};

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function StudentRosterActionsMenu({ student }: StudentRosterActionsMenuProps) {
  const detailT = useTranslations("TenantLiveClasses.courses.detail");

  async function handleCopy(value: string, label: string) {
    try {
      await copyText(value);
      toast.success(detailT("people.table.copySuccess", { label }));
    } catch {
      toast.error(detailT("people.table.copyError"));
    }
  }

  const guardianStatus = student.guardianLinked
    ? detailT("people.table.linked")
    : detailT("people.table.notLinked");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TableActionsMenuButton label={detailT("people.table.actionsMenu")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          {detailT("people.table.actionsLabel")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="justify-between"
          onSelect={() =>
            void handleCopy(student.name, detailT("people.table.student"))
          }
        >
          <span>{detailT("people.table.copyStudentName")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="justify-between"
          onSelect={() =>
            void handleCopy(student.gradeLevel, detailT("people.table.grade"))
          }
        >
          <span>{detailT("people.table.copyGradeLevel")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="justify-between"
          onSelect={() =>
            void handleCopy(guardianStatus, detailT("people.table.guardian"))
          }
        >
          <span>{detailT("people.table.copyGuardianStatus")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FlexidualCourseStudentsTable({
  students,
}: FlexidualCourseStudentsTableProps) {
  const detailT = useTranslations("TenantLiveClasses.courses.detail");

  return (
    <TableSurface className="rounded-[1.5rem] border-border/70 bg-background/75">
      <Table>
        <TableHeader className="bg-background/65">
          <TableRow className="hover:bg-transparent">
            <TableHead>{detailT("people.table.student")}</TableHead>
            <TableHead>{detailT("people.table.grade")}</TableHead>
            <TableHead>{detailT("people.table.guardian")}</TableHead>
            <TableHead className="w-12 pr-5 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.length > 0 ? (
            students.map((student) => (
              <TableRow
                key={student.id}
                className="bg-background/40 hover:bg-muted/20"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-muted text-xs font-semibold">
                        {getImageFallbackLabel({
                          name: student.name,
                          fallback: "ST",
                        })}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-foreground">
                        {student.name}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {student.id}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {student.gradeLevel}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={student.guardianLinked ? "secondary" : "outline"}
                    className="rounded-full"
                  >
                    {student.guardianLinked
                      ? detailT("people.table.linked")
                      : detailT("people.table.notLinked")}
                  </Badge>
                </TableCell>
                <TableActionsCell>
                  <StudentRosterActionsMenu student={student} />
                </TableActionsCell>
              </TableRow>
            ))
          ) : (
            <TableStateRow colSpan={4}>
              {detailT("people.table.empty")}
            </TableStateRow>
          )}
        </TableBody>
      </Table>
    </TableSurface>
  );
}
