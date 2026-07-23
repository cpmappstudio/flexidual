import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { composeModuleTables } from "./lib/modules";
import { liveClassTables } from "./modules/liveClasses/tables";
import {
  capabilityKeyValidator,
  capabilitySourceValidator,
  guardianRelationshipTypeValidator,
  organizationRoleValidator,
  organizationPersonRoleValidator,
  organizationInvitationStatusValidator,
  platformInvitationStatusValidator,
  platformRoleValidator,
} from "./lib/validators";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  users: defineTable({
    platformRole: v.optional(platformRoleValidator),
    hasPlatformAccess: v.optional(v.boolean()),
    personId: v.optional(v.id("people")),
    defaultOrganizationId: v.optional(v.id("organizations")),
    // `name` is part of the Convex Auth users contract: OAuth providers
    // patch this field with the profile name. Do not remove unless you also
    // override the OAuth profile callback for every provider.
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    .index("by_has_platform_access_and_email", ["hasPlatformAccess", "email"])
    .index("by_person_id", ["personId"])
    // `email` and `phone` keep their literal names because Convex Auth's
    // internal implementation calls .withIndex("email") / .withIndex("phone")
    // (see @convex-dev/auth/server/implementation/users.ts).
    .index("email", ["email"])
    .index("phone", ["phone"]),
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_slug", ["slug"]),
  campuses: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    slug: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_id_and_name", ["organizationId", "name"])
    .index("by_organization_id_and_slug", ["organizationId", "slug"]),
  academicGradeLevels: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    code: v.string(),
    stage: v.optional(v.string()),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_id_and_sort_order", ["organizationId", "sortOrder"])
    .index("by_organization_id_and_code", ["organizationId", "code"]),
  campusGradeOfferings: defineTable({
    // `organizationId` is denormalized from both `campusId` and
    // `gradeLevelId` so tenant-scoped reads and writes can use indexes
    // directly. The invariant is enforced in `convex/lib/academic.ts`.
    organizationId: v.id("organizations"),
    campusId: v.id("campuses"),
    gradeLevelId: v.id("academicGradeLevels"),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_id_and_campus_id_and_grade_level_id", [
      "organizationId",
      "campusId",
      "gradeLevelId",
    ])
    .index("by_organization_id_and_grade_level_id_and_is_active", [
      "organizationId",
      "gradeLevelId",
      "isActive",
    ]),
  organizationMemberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: organizationRoleValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_user_id_and_organization_id", ["userId", "organizationId"]),
  organizationUserActivityDays: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    activityDate: v.string(),
    activityCount: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization_id_and_user_id_and_activity_date", [
    "organizationId",
    "userId",
    "activityDate",
  ]),
  organizationPersonActivityDays: defineTable({
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
    activityDate: v.string(),
    activityCount: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization_id_and_organization_person_id_and_activity_date", [
    "organizationId",
    "organizationPersonId",
    "activityDate",
  ]),
  people: defineTable({
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  organizationPeople: defineTable({
    organizationId: v.id("organizations"),
    personId: v.id("people"),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Tenant-scoped scans use `by_organization_id_and_person_id` with a
    // single-field prefix (no `personId` constraint); a standalone
    // `by_organization_id` would be redundant.
    .index("by_organization_id_and_is_active_and_person_id", [
      "organizationId",
      "isActive",
      "personId",
    ])
    .index("by_organization_id_and_person_id", ["organizationId", "personId"])
    .index("by_person_id", ["personId"]),
  organizationPersonCampusAssignments: defineTable({
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
    campusId: v.id("campuses"),
    isPrimary: v.boolean(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_id_and_campus_id_and_is_active", [
      "organizationId",
      "campusId",
      "isActive",
    ])
    .index("by_org_id_and_op_id_and_is_active", [
      "organizationId",
      "organizationPersonId",
      "isActive",
    ])
    .index("by_org_id_and_op_id_and_campus_id", [
      "organizationId",
      "organizationPersonId",
      "campusId",
    ]),
  organizationPersonRoles: defineTable({
    // `organizationId` is denormalized: it is derivable from
    // `organizationPersonId` via `organizationPeople`, but storing it here
    // lets queries scope by tenant directly through the
    // `by_organization_id_and_role` index. The invariant is enforced at
    // write time in
    // `convex/lib/organizationPeople.ts:upsertOrganizationPersonRole`,
    // which validates that the organizationPerson sits in the given org
    // before inserting both fields together.
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
    role: organizationPersonRoleValidator,
    // Denormalized from `organizationPeople.isActive` so role + active
    // filters can be pushed into an index before pagination. Optional during
    // migration; all new writes set it.
    organizationPersonIsActive: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_id_and_role", ["organizationId", "role"])
    .index("by_org_id_and_role_and_op_is_active", [
      "organizationId",
      "role",
      "organizationPersonIsActive",
    ])
    .index("by_organization_person_id_and_role", [
      "organizationPersonId",
      "role",
    ])
    .index("by_organization_id_and_organization_person_id", [
      "organizationId",
      "organizationPersonId",
    ]),
  guardianRelationships: defineTable({
    // `organizationId` is denormalized: it is derivable from either
    // `guardianOrganizationPersonId` or `studentOrganizationPersonId` via
    // `organizationPeople`, but storing it here lets the indexes below
    // scope queries by tenant without joins. The invariant is enforced at
    // write time in
    // `convex/lib/organizationPeople.ts:upsertGuardianRelationship`, which
    // validates that both organizationPeople sit in the same org before
    // inserting all four fields together.
    organizationId: v.id("organizations"),
    guardianOrganizationPersonId: v.id("organizationPeople"),
    studentOrganizationPersonId: v.id("organizationPeople"),
    relationshipType: guardianRelationshipTypeValidator,
    isPrimary: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // "all guardians in an org" and "lookup of relationships for a
    // guardian" both reuse the 4-field index below via prefix lookup; a
    // separate by_organization_id_and_guardian_organization_person_id
    // would be redundant.
    .index("by_organization_id_and_student_organization_person_id", [
      "organizationId",
      "studentOrganizationPersonId",
    ])
    // Convex caps index identifiers at 64 chars; "op" abbreviates
    // organizationPerson and "type" abbreviates relationshipType.
    .index("by_org_id_and_guardian_op_id_and_student_op_id_and_type", [
      "organizationId",
      "guardianOrganizationPersonId",
      "studentOrganizationPersonId",
      "relationshipType",
    ]),
  organizationPersonPins: defineTable({
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
    algorithm: v.optional(v.string()),
    iterations: v.optional(v.number()),
    pinHash: v.string(),
    salt: v.string(),
    failedAttemptCount: v.number(),
    lockedUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org_id_and_op_id", [
    "organizationId",
    "organizationPersonId",
  ]),
  organizationPersonProfileUnlocks: defineTable({
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
    authSessionId: v.id("authSessions"),
    userId: v.id("users"),
    unlockedAt: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org_id_and_op_id_and_auth_session_id", [
    "organizationId",
    "organizationPersonId",
    "authSessionId",
  ]),
  organizationCapabilities: defineTable({
    organizationId: v.id("organizations"),
    capabilityKey: capabilityKeyValidator,
    enabled: v.boolean(),
    source: capabilitySourceValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_id_and_capability_key", [
      "organizationId",
      "capabilityKey",
    ])
    .index("by_organization_id_and_enabled_and_updated_at", [
      "organizationId",
      "enabled",
      "updatedAt",
    ])
    .index("by_organization_id_and_updated_at", [
      "organizationId",
      "updatedAt",
    ]),
  organizationInvitations: defineTable({
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
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_org_id_and_status_and_created_at", [
      "organizationId",
      "status",
      "createdAt",
    ])
    .index("by_org_id_and_status_and_email", [
      "organizationId",
      "status",
      "email",
    ]),
  platformInvitations: defineTable({
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
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_status_and_email", ["status", "email"]),
  // Business modules append their own `<module>Tables` here via
  // `composeModuleTables(...)`. Keep module tables outside the platform core
  // so the first real module follows a fixed pattern instead of inventing one.
  ...composeModuleTables(liveClassTables),
});
