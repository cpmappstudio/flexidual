import { v } from "convex/values";
import {
  platformCapabilityRegistry,
  platformModuleKeys,
} from "../../lib/platform/capabilities";
import { organizationPersonRoles } from "../../lib/people/roles";

export const organizationRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);

export const platformRoleValidator = v.union(
  v.literal("superadmin"),
  v.literal("viewer"),
);

export const appLocaleValidator = v.union(v.literal("en"), v.literal("es"));

export const imageChangeValidator = v.union(
  v.object({
    kind: v.literal("keep"),
  }),
  v.object({
    kind: v.literal("set"),
    storageId: v.id("_storage"),
  }),
  v.object({
    kind: v.literal("remove"),
  }),
);

export const avatarChangeValidator = imageChangeValidator;

export const platformInvitationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("expired"),
  v.literal("revoked"),
);

export const organizationInvitationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("expired"),
  v.literal("revoked"),
);

const capabilityKeyLiterals = platformCapabilityRegistry.map((capability) =>
  v.literal(capability.key),
);

const moduleKeyLiterals = platformModuleKeys.map((moduleKey) =>
  v.literal(moduleKey),
);

export const capabilityKeyValidator = v.union(
  ...(capabilityKeyLiterals as [
    (typeof capabilityKeyLiterals)[number],
    (typeof capabilityKeyLiterals)[number],
    ...(typeof capabilityKeyLiterals)[number][],
  ]),
);

export const capabilitySourceValidator = v.union(
  v.literal("manual"),
  v.literal("plan"),
  v.literal("trial"),
  v.literal("override"),
);

export const moduleKeyValidator = v.union(
  ...(moduleKeyLiterals as [
    (typeof moduleKeyLiterals)[number],
    (typeof moduleKeyLiterals)[number],
    ...(typeof moduleKeyLiterals)[number][],
  ]),
);

const organizationPersonRoleLiterals = organizationPersonRoles.map((role) =>
  v.literal(role),
);

export const organizationPersonRoleValidator = v.union(
  ...(organizationPersonRoleLiterals as [
    (typeof organizationPersonRoleLiterals)[number],
    (typeof organizationPersonRoleLiterals)[number],
    ...(typeof organizationPersonRoleLiterals)[number][],
  ]),
);

export const organizationPeopleActiveFilterValidator = v.union(
  v.literal("all"),
  v.literal("active"),
  v.literal("inactive"),
);

export const guardianRelationshipTypeValidator = v.union(
  v.literal("parent"),
  v.literal("mother"),
  v.literal("father"),
  v.literal("guardian"),
  v.literal("emergency_contact"),
);

export const organizationValidator = v.object({
  _id: v.id("organizations"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const campusValidator = v.object({
  _id: v.id("campuses"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const academicGradeLevelValidator = v.object({
  _id: v.id("academicGradeLevels"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  name: v.string(),
  code: v.string(),
  stage: v.optional(v.string()),
  sortOrder: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const campusGradeOfferingRecordValidator = v.object({
  _id: v.id("campusGradeOfferings"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  campusId: v.id("campuses"),
  gradeLevelId: v.id("academicGradeLevels"),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  gradeLevel: academicGradeLevelValidator,
});

export const organizationMembershipValidator = v.object({
  _id: v.id("organizationMemberships"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  userId: v.id("users"),
  role: organizationRoleValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const organizationUserActivityDayValidator = v.object({
  _id: v.id("organizationUserActivityDays"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  userId: v.id("users"),
  activityDate: v.string(),
  activityCount: v.number(),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const organizationPersonActivityDayValidator = v.object({
  _id: v.id("organizationPersonActivityDays"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  organizationPersonId: v.id("organizationPeople"),
  activityDate: v.string(),
  activityCount: v.number(),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const userActivityHeatmapValueValidator = v.object({
  date: v.string(),
  value: v.number(),
});

export const userActivityForYearValidator = v.object({
  days: v.array(userActivityHeatmapValueValidator),
  lastSeenAt: v.union(v.number(), v.null()),
});

export const organizationPersonValidator = v.object({
  _id: v.id("organizationPeople"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  personId: v.id("people"),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const organizationPersonRoleRecordValidator = v.object({
  _id: v.id("organizationPersonRoles"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  organizationPersonId: v.id("organizationPeople"),
  role: organizationPersonRoleValidator,
  organizationPersonIsActive: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const organizationPersonRecordValidator = v.object({
  _id: v.id("organizationPeople"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  personId: v.id("people"),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  displayName: v.optional(v.string()),
  name: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  roles: v.array(organizationPersonRoleValidator),
});

export const organizationPersonAccountSummaryValidator = v.union(
  v.object({
    kind: v.literal("self"),
    userId: v.id("users"),
    email: v.union(v.string(), v.null()),
    userSince: v.number(),
  }),
  v.object({
    kind: v.literal("guardian"),
    userId: v.id("users"),
    email: v.union(v.string(), v.null()),
    userSince: v.number(),
    guardianOrganizationPersonId: v.id("organizationPeople"),
    guardianName: v.string(),
  }),
  v.object({
    kind: v.literal("none"),
  }),
);

export const organizationPersonListRecordValidator = v.object({
  person: organizationPersonRecordValidator,
  account: organizationPersonAccountSummaryValidator,
  primaryCampus: v.union(campusValidator, v.null()),
});

export const organizationPersonCampusAssignmentValidator = v.object({
  _id: v.id("organizationPersonCampusAssignments"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  organizationPersonId: v.id("organizationPeople"),
  campusId: v.id("campuses"),
  isPrimary: v.boolean(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const organizationPersonCampusRecordValidator = v.object({
  assignment: organizationPersonCampusAssignmentValidator,
  person: organizationPersonRecordValidator,
});

export const organizationPersonCampusProfileRecordValidator = v.object({
  assignment: organizationPersonCampusAssignmentValidator,
  campus: campusValidator,
  student: v.optional(organizationPersonRecordValidator),
});

export const guardianRelationshipValidator = v.object({
  _id: v.id("guardianRelationships"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  guardianOrganizationPersonId: v.id("organizationPeople"),
  studentOrganizationPersonId: v.id("organizationPeople"),
  relationshipType: guardianRelationshipTypeValidator,
  isPrimary: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const organizationPersonProfileAccountSummaryValidator = v.object({
  userId: v.id("users"),
  email: v.union(v.string(), v.null()),
  userSince: v.number(),
});

export const organizationPersonProfileAccountValidator =
  organizationPersonAccountSummaryValidator;

export const organizationPersonGuardianProfileRecordValidator = v.object({
  relationship: guardianRelationshipValidator,
  guardian: organizationPersonRecordValidator,
  account: v.union(organizationPersonProfileAccountSummaryValidator, v.null()),
});

export const organizationPersonChildProfileRecordValidator = v.object({
  relationship: guardianRelationshipValidator,
  student: organizationPersonRecordValidator,
  campusAssignments: v.array(organizationPersonCampusProfileRecordValidator),
});

export const organizationPersonProfileRecordValidator = v.object({
  person: organizationPersonRecordValidator,
  account: organizationPersonProfileAccountValidator,
  campusAssignments: v.array(organizationPersonCampusProfileRecordValidator),
  guardians: v.array(organizationPersonGuardianProfileRecordValidator),
  children: v.array(organizationPersonChildProfileRecordValidator),
  profileOwnerKind: v.union(
    v.literal("student"),
    v.literal("guardian"),
    v.literal("teacher"),
  ),
  selectedStudentOrganizationPersonId: v.id("organizationPeople"),
  canManageProfile: v.boolean(),
  canManagePassword: v.boolean(),
  canManagePin: v.boolean(),
  hasPin: v.boolean(),
});

export const tenantProfileSelectionGuardianProfileValidator = v.object({
  kind: v.literal("guardian"),
  person: organizationPersonRecordValidator,
  pinRequired: v.boolean(),
  pinVerified: v.boolean(),
});

export const tenantProfileSelectionChildProfileValidator = v.object({
  kind: v.literal("child"),
  person: organizationPersonRecordValidator,
});

export const tenantProfileSelectionProfileValidator = v.union(
  tenantProfileSelectionGuardianProfileValidator,
  tenantProfileSelectionChildProfileValidator,
);

export const tenantProfileSelectionValidator = v.object({
  requiresSelection: v.boolean(),
  guardian: v.union(tenantProfileSelectionGuardianProfileValidator, v.null()),
  children: v.array(tenantProfileSelectionChildProfileValidator),
});

export const organizationCapabilityValidator = v.object({
  _id: v.id("organizationCapabilities"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  capabilityKey: capabilityKeyValidator,
  enabled: v.boolean(),
  source: capabilitySourceValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const capabilityRegistryEntryValidator = v.object({
  key: capabilityKeyValidator,
  moduleKey: moduleKeyValidator,
  name: v.string(),
  description: v.string(),
  enabled: v.boolean(),
  source: v.union(capabilitySourceValidator, v.null()),
});

export const organizationAccessValidator = v.object({
  organization: organizationValidator,
  membership: v.union(organizationMembershipValidator, v.null()),
  effectiveRole: organizationRoleValidator,
  isPlatformAdmin: v.boolean(),
});

export const organizationWorkspaceValidator = v.object({
  organization: organizationValidator,
  membership: v.union(organizationMembershipValidator, v.null()),
  effectiveRole: organizationRoleValidator,
  isPlatformAdmin: v.boolean(),
  enabledCapabilityKeys: v.array(capabilityKeyValidator),
  enabledModuleKeys: v.array(moduleKeyValidator),
});

export const platformInvitationValidator = v.object({
  _id: v.id("platformInvitations"),
  _creationTime: v.number(),
  email: v.string(),
  role: platformRoleValidator,
  status: platformInvitationStatusValidator,
  invitedByUserId: v.id("users"),
  acceptedByUserId: v.optional(v.id("users")),
  tokenHash: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
  acceptedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
});

export const organizationInvitationValidator = v.object({
  _id: v.id("organizationInvitations"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  email: v.string(),
  status: organizationInvitationStatusValidator,
  invitedByUserId: v.id("users"),
  tokenHash: v.string(),
  membershipRole: organizationRoleValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
  acceptedByUserId: v.optional(v.id("users")),
  acceptedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
});
