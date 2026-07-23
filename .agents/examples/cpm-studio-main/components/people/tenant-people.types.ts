import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { OrganizationPersonRole } from "@/lib/people/roles";

export type TenantOrganizationPersonListRecord = FunctionReturnType<
  typeof api.platform.people.listOrganizationPeople
>["page"][number];

export type TenantOrganizationPerson =
  TenantOrganizationPersonListRecord["person"];

export type TenantStudentProfile = FunctionReturnType<
  typeof api.platform.people.getStudentProfile
>;

export type TenantTeacherProfile = FunctionReturnType<
  typeof api.platform.people.getTeacherProfile
>;

export type TenantAcademicPersonProfile =
  | TenantStudentProfile
  | TenantTeacherProfile;

export type TenantAcademicCampusAssignment =
  TenantAcademicPersonProfile["campusAssignments"][number];

export type TenantTeamRole = "owner" | "admin" | "member";

export type TenantTeamMember = FunctionReturnType<
  typeof api.platform.organizationTeam.listMembersForOrganization
>["page"][number];

export type TenantTeamInvitation = FunctionReturnType<
  typeof api.platform.organizationInvitations.listMembershipForOrganization
>["page"][number];

export type TenantOrganizationPersonRole = OrganizationPersonRole;

export type TenantPeopleActiveFilter = "all" | "active" | "inactive";
