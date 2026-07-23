export const organizationPersonRoles = [
  "student",
  "teacher",
  "guardian",
  "staff",
  "applicant",
] as const;

export type OrganizationPersonRole = (typeof organizationPersonRoles)[number];
