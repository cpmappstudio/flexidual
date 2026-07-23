import type { Id } from "@/convex/_generated/dataModel";
import type { OrganizationPersonRole } from "@/lib/people/roles";

type TenantSelectableProfilePerson = {
  _id: Id<"organizationPeople">;
  name: string;
  avatarUrl: string | null;
  roles: OrganizationPersonRole[];
  isActive: boolean;
};

export type TenantSelectableGuardianProfile = {
  kind: "guardian";
  person: TenantSelectableProfilePerson;
  pinRequired: boolean;
  pinVerified: boolean;
};

type TenantSelectableChildProfile = {
  kind: "child";
  person: TenantSelectableProfilePerson;
};

export type TenantSelectableProfile =
  | TenantSelectableGuardianProfile
  | TenantSelectableChildProfile;

export type TenantProfileSelection = {
  requiresSelection: boolean;
  guardian: TenantSelectableGuardianProfile | null;
  children: TenantSelectableChildProfile[];
};
