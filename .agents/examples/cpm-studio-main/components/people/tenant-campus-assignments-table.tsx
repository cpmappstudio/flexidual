import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import type {
  TenantAcademicCampusAssignment,
  TenantOrganizationPersonRole,
} from "@/components/people/tenant-people.types";
import {
  TableActionsCell,
  TableActionsMenuButton,
  TableStateRow,
  TableSurface,
} from "@/components/tables/table-primitives";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Id } from "@/convex/_generated/dataModel";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";

type AcademicCampusRole = Extract<
  TenantOrganizationPersonRole,
  "student" | "teacher"
>;

type TenantCampusAssignmentsTableVariant = "singleProfile" | "guardianStudents";

function CampusAssignmentRoleSelect({ value }: { value: AcademicCampusRole }) {
  const t = useTranslations("TenantPeople");

  return (
    <Select value={value} disabled>
      <SelectTrigger className="w-full max-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="student">{t("roles.student")}</SelectItem>
          <SelectItem value="teacher">{t("roles.teacher")}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function getCampusAssignmentRole(
  assignment: TenantAcademicCampusAssignment,
  fallbackRole: AcademicCampusRole,
): AcademicCampusRole {
  const roles = assignment.student?.roles;
  if (roles?.includes("teacher") && !roles.includes("student")) {
    return "teacher";
  }

  return fallbackRole;
}

function CampusAssignmentStudentCell({
  assignment,
  unnamedLabel,
}: {
  assignment: TenantAcademicCampusAssignment;
  unnamedLabel: string;
}) {
  const student = assignment.student;

  if (!student) {
    return <span className="text-muted-foreground">{unnamedLabel}</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 rounded-lg">
        <AvatarImage
          src={getOptionalImageSrc(student.avatarUrl)}
          alt={student.name}
        />
        <AvatarFallback className="rounded-lg text-xs font-semibold">
          {getInitials(student.name, "ST")}
        </AvatarFallback>
      </Avatar>
      <span className="truncate font-medium text-foreground">
        {student.name || unnamedLabel}
      </span>
    </div>
  );
}

export function TenantCampusAssignmentsTable({
  assignments,
  campusRole,
  canManageCampuses,
  emptyLabel,
  removeCampusAction,
  removingAssignmentId,
  variant = "singleProfile",
}: {
  assignments: TenantAcademicCampusAssignment[];
  campusRole: AcademicCampusRole;
  canManageCampuses: boolean;
  emptyLabel: string;
  removeCampusAction: (assignment: TenantAcademicCampusAssignment) => void;
  removingAssignmentId: Id<"organizationPersonCampusAssignments"> | null;
  variant?: TenantCampusAssignmentsTableVariant;
}) {
  const t = useTranslations("TenantPeople");
  const showsStudentColumn = variant === "guardianStudents";

  return (
    <TableSurface>
      <Table>
        <TableHeader className="bg-card">
          <TableRow className="hover:bg-transparent">
            {showsStudentColumn ? (
              <TableHead>{t("profile.campusesTable.student")}</TableHead>
            ) : null}
            <TableHead>{t("profile.campusesTable.campus")}</TableHead>
            <TableHead>{t("profile.campusesTable.role")}</TableHead>
            <TableHead className="w-12 pr-5 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.length ? (
            assignments.map((campusAssignment) => (
              <TableRow
                key={campusAssignment.assignment._id}
                className="bg-card hover:bg-card"
              >
                {showsStudentColumn ? (
                  <TableCell>
                    <CampusAssignmentStudentCell
                      assignment={campusAssignment}
                      unnamedLabel={t("table.unnamedPerson")}
                    />
                  </TableCell>
                ) : null}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9 rounded-lg">
                      <AvatarImage
                        src={getOptionalImageSrc(
                          campusAssignment.campus.imageUrl,
                        )}
                        alt={campusAssignment.campus.name}
                      />
                      <AvatarFallback className="rounded-lg text-xs font-semibold">
                        {getInitials(campusAssignment.campus.name, "CA")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-foreground">
                        {campusAssignment.campus.name}
                      </span>
                      {campusAssignment.assignment.isPrimary ? (
                        <Badge
                          variant="secondary"
                          className="w-fit rounded-full"
                        >
                          {t("profile.primaryCampus")}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <CampusAssignmentRoleSelect
                    value={getCampusAssignmentRole(
                      campusAssignment,
                      campusRole,
                    )}
                  />
                </TableCell>
                <TableActionsCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <TableActionsMenuButton
                        label={t("profile.campusesTable.actionsMenu")}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        variant="destructive"
                        className="justify-between"
                        disabled={
                          !canManageCampuses ||
                          removingAssignmentId ===
                            campusAssignment.assignment._id
                        }
                        onClick={() => removeCampusAction(campusAssignment)}
                      >
                        <span>{t("profile.removeFromCampus")}</span>
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableActionsCell>
              </TableRow>
            ))
          ) : (
            <TableStateRow colSpan={showsStudentColumn ? 4 : 3}>
              {emptyLabel}
            </TableStateRow>
          )}
        </TableBody>
      </Table>
    </TableSurface>
  );
}
