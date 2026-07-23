import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { getAuthSessionId } from "@convex-dev/auth/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import {
  hasOrganizationRole,
  requireOrganizationAccess,
  requireOrganizationRole,
} from "../lib/authz";
import {
  buildCampusResponse,
  requireCampusInOrganization,
} from "../lib/campuses";
import { throwAppError } from "../lib/errors";
import { clampPaginationOpts } from "../lib/queryLimits";
import { createPerson, savePersonProfile } from "../lib/people";
import {
  buildOrganizationPersonRecord,
  createOrganizationPersonWithRole,
  deactivateOrganizationPersonCampusAssignment,
  deleteGuardianRelationship,
  deleteOrganizationPersonCoreProfileBatch,
  listActiveCampusAssignmentsForOrganizationPerson,
  listGuardianRelationshipsForGuardian,
  listGuardianRelationshipsForStudent,
  MAX_STUDENTS_PER_GUARDIAN_ACCOUNT,
  listOrganizationPersonRoles,
  requireOrganizationPersonInOrganization,
  setOrganizationPersonActiveState,
  upsertGuardianRelationship,
  upsertOrganizationPerson,
  upsertOrganizationPersonCampusAssignment,
  upsertOrganizationPersonRole,
} from "../lib/organizationPeople";
import {
  organizationPeopleActiveFilterValidator,
  organizationPersonCampusRecordValidator,
  organizationPersonChildProfileRecordValidator,
  organizationPersonListRecordValidator,
  organizationPersonProfileRecordValidator,
  organizationPersonRecordValidator,
  organizationPersonRoleValidator,
  tenantProfileSelectionValidator,
  avatarChangeValidator,
} from "../lib/validators";
import { ORGANIZATION_PERSON_DELETION_BATCH_SIZE } from "../lib/queryLimits";
import { deleteBusinessModuleRowsForOrganizationPersonBatch } from "../modules/delete";
import { getUserByPersonId } from "../lib/users";
import {
  getOrganizationPersonPin,
  invalidateOrganizationPersonProfileUnlocks,
  isOrganizationPersonProfileUnlocked,
  lockOrganizationPersonProfile,
  setOrganizationPersonPin,
  unlockOrganizationPersonProfile,
  verifyOrganizationPersonPin,
} from "../lib/profilePins";
import type { OrganizationPersonRole } from "../../lib/people/roles";
import { academicPersonProfileInputValidator } from "./academicPeopleValidators";

function normalizeRoles(roles: ReadonlyArray<OrganizationPersonRole>) {
  return [...new Set(roles)];
}

function hasOnlyOrganizationPersonRole(
  roles: ReadonlyArray<OrganizationPersonRole>,
  role: OrganizationPersonRole,
) {
  const uniqueRoles = new Set(roles);

  return uniqueRoles.size === 1 && uniqueRoles.has(role);
}

function needsAnotherDeletionBatch(counts: Record<string, number>) {
  return Object.values(counts).some(
    (deletedCount) => deletedCount === ORGANIZATION_PERSON_DELETION_BATCH_SIZE,
  );
}

async function deleteGuardianChildRowsBatch(
  ctx: MutationCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPersonId: Doc<"organizationPeople">["_id"];
  },
) {
  const moduleCounts = await deleteBusinessModuleRowsForOrganizationPersonBatch(
    ctx,
    {
      organizationId: args.organizationId,
      organizationPersonId: args.organizationPersonId,
      batchSize: ORGANIZATION_PERSON_DELETION_BATCH_SIZE,
    },
  );

  if (needsAnotherDeletionBatch(moduleCounts)) {
    return true;
  }

  const coreCounts = await deleteOrganizationPersonCoreProfileBatch(
    ctx,
    {
      organizationId: args.organizationId,
      organizationPersonId: args.organizationPersonId,
    },
    ORGANIZATION_PERSON_DELETION_BATCH_SIZE,
  );

  return needsAnotherDeletionBatch(coreCounts);
}

async function scheduleGuardianChildCleanup(
  ctx: MutationCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPersonId: Doc<"organizationPeople">["_id"];
  },
) {
  await ctx.scheduler.runAfter(
    0,
    internal.platform.people.deleteGuardianChildCleanupInternal,
    args,
  );
}

function buildAccountSummary(
  user: Awaited<ReturnType<typeof getUserByPersonId>>,
) {
  if (!user) {
    return null;
  }

  return {
    userId: user._id,
    email: user.email ?? null,
    userSince: user._creationTime,
  };
}

const organizationPersonPasswordResetTargetValidator = v.object({
  userId: v.id("users"),
  email: v.string(),
});

const passwordResetAccountScopeValidator = v.union(
  v.literal("self"),
  v.literal("withGuardianFallback"),
);

const guardianPinStatusValidator = v.object({
  canManagePin: v.boolean(),
  hasPin: v.boolean(),
});

async function getOrganizationPersonAccountSummary(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPerson: Doc<"organizationPeople">;
  },
) {
  const selfAccount = await getOrganizationPersonSelfAccountSummary(ctx, args);
  if (selfAccount) {
    return selfAccount;
  }

  const guardianRelationships = await listGuardianRelationshipsForStudent(ctx, {
    organizationId: args.organizationId,
    studentOrganizationPersonId: args.organizationPerson._id,
  });
  const guardians = (
    await Promise.all(
      guardianRelationships.map(async (relationship) => {
        const guardianOrganizationPerson = await ctx.db.get(
          relationship.guardianOrganizationPersonId,
        );
        if (
          !guardianOrganizationPerson ||
          guardianOrganizationPerson.organizationId !== args.organizationId
        ) {
          return null;
        }

        const guardianUser = await getUserByPersonId(
          ctx,
          guardianOrganizationPerson.personId,
        );
        if (guardianUser?.defaultOrganizationId !== args.organizationId) {
          return null;
        }

        const guardianAccount = buildAccountSummary(guardianUser);
        if (!guardianAccount) {
          return null;
        }
        const guardian = await buildOrganizationPersonRecord(
          ctx,
          guardianOrganizationPerson,
        );

        return {
          relationship,
          guardian,
          account: guardianAccount,
        };
      }),
    )
  ).filter((record) => record !== null);

  const primaryGuardian =
    guardians.find((guardian) => guardian.relationship.isPrimary) ??
    guardians[0];

  return primaryGuardian
    ? {
        kind: "guardian" as const,
        ...primaryGuardian.account,
        guardianOrganizationPersonId: primaryGuardian.guardian._id,
        guardianName: primaryGuardian.guardian.name,
      }
    : {
        kind: "none" as const,
      };
}

async function getOrganizationPersonSelfAccountSummary(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPerson: Doc<"organizationPeople">;
  },
) {
  const selfUser = await getUserByPersonId(
    ctx,
    args.organizationPerson.personId,
  );
  const selfAccount =
    selfUser?.defaultOrganizationId === args.organizationId
      ? buildAccountSummary(selfUser)
      : null;

  return selfAccount
    ? {
        kind: "self" as const,
        ...selfAccount,
      }
    : null;
}

async function getPrimaryCampusForOrganizationPerson(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPerson: Doc<"organizationPeople">;
  },
) {
  const activeAssignments =
    await listActiveCampusAssignmentsForOrganizationPerson(ctx, {
      organizationId: args.organizationId,
      organizationPersonId: args.organizationPerson._id,
    });
  const primaryAssignment =
    activeAssignments.find((assignment) => assignment.isPrimary) ??
    activeAssignments[0];
  if (!primaryAssignment) {
    return null;
  }

  const campus = await ctx.db.get(primaryAssignment.campusId);
  if (!campus || campus.organizationId !== args.organizationId) {
    return null;
  }

  return await buildCampusResponse(ctx, campus);
}

async function buildCampusAssignmentProfileRecords(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPerson: Doc<"organizationPeople">;
    student?: Awaited<ReturnType<typeof buildOrganizationPersonRecord>>;
  },
) {
  const activeAssignments =
    await listActiveCampusAssignmentsForOrganizationPerson(ctx, {
      organizationId: args.organizationId,
      organizationPersonId: args.organizationPerson._id,
    });

  return (
    await Promise.all(
      activeAssignments.map(async (assignment) => {
        const campus = await ctx.db.get("campuses", assignment.campusId);
        if (!campus || campus.organizationId !== args.organizationId) {
          return null;
        }

        return {
          assignment,
          campus: await buildCampusResponse(ctx, campus),
          ...(args.student ? { student: args.student } : {}),
        };
      }),
    )
  ).filter((record) => record !== null);
}

async function buildGuardianChildProfileRecord(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    relationship: Doc<"guardianRelationships">;
  },
) {
  const studentOrganizationPerson = await ctx.db.get(
    args.relationship.studentOrganizationPersonId,
  );
  if (
    !studentOrganizationPerson ||
    studentOrganizationPerson.organizationId !== args.organizationId
  ) {
    return null;
  }

  const student = await buildOrganizationPersonRecord(
    ctx,
    studentOrganizationPerson,
  );

  return {
    relationship: args.relationship,
    student,
    campusAssignments: await buildCampusAssignmentProfileRecords(ctx, {
      organizationId: args.organizationId,
      organizationPerson: studentOrganizationPerson,
    }),
  };
}

async function listGuardianChildProfileRecords(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    guardianOrganizationPersonId: Doc<"organizationPeople">["_id"];
  },
) {
  const relationships = await listGuardianRelationshipsForGuardian(ctx, args);
  const children = (
    await Promise.all(
      relationships.map((relationship) =>
        buildGuardianChildProfileRecord(ctx, {
          organizationId: args.organizationId,
          relationship,
        }),
      ),
    )
  ).filter((record) => record !== null);

  return children.sort((left, right) => {
    if (left.relationship.isPrimary !== right.relationship.isPrimary) {
      return left.relationship.isPrimary ? -1 : 1;
    }

    return left.student.name.localeCompare(right.student.name);
  });
}

export const getCurrentProfileSelection = query({
  args: {
    slug: v.string(),
  },
  returns: tenantProfileSelectionValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccess(ctx, args.slug);
    const guardianOrganizationPerson = access.organizationPerson;

    if (!guardianOrganizationPerson?.isActive) {
      return {
        requiresSelection: false,
        guardian: null,
        children: [],
      };
    }

    const guardian = await buildOrganizationPersonRecord(
      ctx,
      guardianOrganizationPerson,
    );

    if (!guardian.roles.includes("guardian")) {
      return {
        requiresSelection: false,
        guardian: null,
        children: [],
      };
    }

    const relationships = await listGuardianRelationshipsForGuardian(ctx, {
      organizationId: access.organization._id,
      guardianOrganizationPersonId: guardianOrganizationPerson._id,
    });
    const [guardianPin, authSessionId] = await Promise.all([
      getOrganizationPersonPin(ctx, {
        organizationId: access.organization._id,
        organizationPersonId: guardianOrganizationPerson._id,
      }),
      getAuthSessionId(ctx),
    ]);
    const pinRequired = guardianPin !== null;
    const pinVerified = pinRequired
      ? await isOrganizationPersonProfileUnlocked(ctx, {
          authSessionId,
          organizationId: access.organization._id,
          organizationPersonId: guardianOrganizationPerson._id,
        })
      : false;
    const childProfiles = (
      await Promise.all(
        relationships.map(async (relationship) => {
          const childOrganizationPerson = await ctx.db.get(
            relationship.studentOrganizationPersonId,
          );
          if (
            !childOrganizationPerson ||
            childOrganizationPerson.organizationId !== access.organization._id
          ) {
            return null;
          }

          const child = await buildOrganizationPersonRecord(
            ctx,
            childOrganizationPerson,
          );
          if (!child.isActive || !child.roles.includes("student")) {
            return null;
          }

          return {
            isPrimary: relationship.isPrimary,
            profile: {
              kind: "child" as const,
              person: child,
            },
          };
        }),
      )
    ).filter((child) => child !== null);
    childProfiles.sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      return left.profile.person.name.localeCompare(right.profile.person.name);
    });
    const children = childProfiles.map((child) => child.profile);

    return {
      requiresSelection: children.length > 0,
      guardian: {
        kind: "guardian" as const,
        person: guardian,
        pinRequired,
        pinVerified,
      },
      children,
    };
  },
});

export const getCurrentGuardianPinStatus = query({
  args: {
    slug: v.string(),
  },
  returns: guardianPinStatusValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccess(ctx, args.slug);
    const guardianOrganizationPerson = access.organizationPerson;

    if (!guardianOrganizationPerson?.isActive) {
      return {
        canManagePin: false,
        hasPin: false,
      };
    }

    const roles = await listOrganizationPersonRoles(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });
    if (!roles.includes("guardian")) {
      return {
        canManagePin: false,
        hasPin: false,
      };
    }

    const guardianPin = await getOrganizationPersonPin(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });

    return {
      canManagePin: true,
      hasPin: guardianPin !== null,
    };
  },
});

export const verifyCurrentGuardianProfilePin = mutation({
  args: {
    slug: v.string(),
    pin: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [access, authSessionId] = await Promise.all([
      requireOrganizationAccess(ctx, args.slug),
      getAuthSessionId(ctx),
    ]);

    if (!authSessionId) {
      throwAppError("NOT_AUTHENTICATED");
    }

    const guardianOrganizationPerson = access.organizationPerson;
    if (!guardianOrganizationPerson?.isActive) {
      throwAppError("UNAUTHORIZED");
    }

    await requireGuardianOrganizationPerson(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });

    const guardianPin = await getOrganizationPersonPin(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });
    if (!guardianPin) {
      throwAppError("PROFILE_PIN_NOT_CONFIGURED");
    }

    await verifyOrganizationPersonPin(ctx, {
      pinRecord: guardianPin,
      pin: args.pin,
    });
    await unlockOrganizationPersonProfile(ctx, {
      authSessionId,
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
      userId: access.userId,
    });

    return null;
  },
});

export const lockCurrentGuardianProfile = mutation({
  args: {
    slug: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [access, authSessionId] = await Promise.all([
      requireOrganizationAccess(ctx, args.slug),
      getAuthSessionId(ctx),
    ]);
    const guardianOrganizationPerson = access.organizationPerson;

    if (!guardianOrganizationPerson?.isActive) {
      return null;
    }

    const roles = await listOrganizationPersonRoles(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });
    if (!roles.includes("guardian")) {
      return null;
    }

    await lockOrganizationPersonProfile(ctx, {
      authSessionId,
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });

    return null;
  },
});

export const changeCurrentGuardianProfilePin = mutation({
  args: {
    slug: v.string(),
    currentPin: v.string(),
    newPin: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [access, authSessionId] = await Promise.all([
      requireOrganizationAccess(ctx, args.slug),
      getAuthSessionId(ctx),
    ]);

    if (!authSessionId) {
      throwAppError("NOT_AUTHENTICATED");
    }

    const guardianOrganizationPerson = access.organizationPerson;
    if (!guardianOrganizationPerson?.isActive) {
      throwAppError("UNAUTHORIZED");
    }

    await requireGuardianOrganizationPerson(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });

    const existingPin = await getOrganizationPersonPin(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });
    if (existingPin) {
      await verifyOrganizationPersonPin(ctx, {
        pinRecord: existingPin,
        pin: args.currentPin,
      });
    }

    await setOrganizationPersonPin(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
      pin: args.newPin,
    });
    await invalidateOrganizationPersonProfileUnlocks(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
    });
    await unlockOrganizationPersonProfile(ctx, {
      authSessionId,
      organizationId: access.organization._id,
      organizationPersonId: guardianOrganizationPerson._id,
      userId: access.userId,
    });

    return null;
  },
});

async function buildOrganizationPersonListRecord(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPerson: Doc<"organizationPeople">;
    accountMode?: "selfOnly" | "withGuardianFallback";
  },
) {
  const accountPromise =
    args.accountMode === "selfOnly"
      ? getOrganizationPersonSelfAccountSummary(ctx, args).then(
          (account) =>
            account ?? {
              kind: "none" as const,
            },
        )
      : getOrganizationPersonAccountSummary(ctx, args);
  const [person, account, primaryCampus] = await Promise.all([
    buildOrganizationPersonRecord(ctx, args.organizationPerson),
    accountPromise,
    getPrimaryCampusForOrganizationPerson(ctx, args),
  ]);

  return {
    person,
    account,
    primaryCampus,
  };
}

async function requireStudentOrganizationPerson(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPersonId: Doc<"organizationPeople">["_id"];
  },
) {
  const organizationPerson = await requireOrganizationPersonInOrganization(
    ctx,
    args,
  );
  const roles = await listOrganizationPersonRoles(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: organizationPerson._id,
  });

  if (!roles.includes("student")) {
    throwAppError("ORGANIZATION_PERSON_NOT_FOUND");
  }

  return organizationPerson;
}

async function requireTeacherOrganizationPerson(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPersonId: Doc<"organizationPeople">["_id"];
  },
) {
  const organizationPerson = await requireOrganizationPersonInOrganization(
    ctx,
    args,
  );
  const roles = await listOrganizationPersonRoles(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: organizationPerson._id,
  });

  if (!roles.includes("teacher")) {
    throwAppError("ORGANIZATION_PERSON_NOT_FOUND");
  }

  return organizationPerson;
}

async function requireGuardianOrganizationPerson(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPersonId: Doc<"organizationPeople">["_id"];
  },
) {
  const organizationPerson = await requireOrganizationPersonInOrganization(
    ctx,
    args,
  );
  const roles = await listOrganizationPersonRoles(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: organizationPerson._id,
  });

  if (!roles.includes("guardian")) {
    throwAppError("ORGANIZATION_PERSON_NOT_FOUND");
  }

  return organizationPerson;
}

async function getOrganizationPersonPasswordResetTarget(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPerson: Doc<"organizationPeople">;
  },
) {
  const selfTarget = await getOrganizationPersonSelfPasswordResetTarget(
    ctx,
    args,
  );
  if (selfTarget) {
    return selfTarget;
  }

  const guardianRelationships = await listGuardianRelationshipsForStudent(ctx, {
    organizationId: args.organizationId,
    studentOrganizationPersonId: args.organizationPerson._id,
  });
  const guardians = await Promise.all(
    guardianRelationships.map(async (relationship) => {
      const guardianOrganizationPerson = await ctx.db.get(
        relationship.guardianOrganizationPersonId,
      );
      if (
        !guardianOrganizationPerson ||
        guardianOrganizationPerson.organizationId !== args.organizationId
      ) {
        return null;
      }

      const guardianUser = await getUserByPersonId(
        ctx,
        guardianOrganizationPerson.personId,
      );
      if (
        !guardianUser?.email ||
        guardianUser.defaultOrganizationId !== args.organizationId
      ) {
        return null;
      }

      return {
        isPrimary: relationship.isPrimary,
        userId: guardianUser._id,
        email: guardianUser.email,
      };
    }),
  );

  const selectedGuardian =
    guardians.find((guardian) => guardian?.isPrimary) ??
    guardians.find((guardian) => guardian !== null);

  return selectedGuardian
    ? {
        userId: selectedGuardian.userId,
        email: selectedGuardian.email,
      }
    : null;
}

async function getOrganizationPersonSelfPasswordResetTarget(
  ctx: QueryCtx,
  args: {
    organizationId: Doc<"organizations">["_id"];
    organizationPerson: Doc<"organizationPeople">;
  },
) {
  const selfUser = await getUserByPersonId(
    ctx,
    args.organizationPerson.personId,
  );

  if (
    !selfUser?.email ||
    selfUser.defaultOrganizationId !== args.organizationId
  ) {
    return null;
  }

  return {
    userId: selfUser._id,
    email: selfUser.email,
  };
}

export const createPersonForOrganization = mutation({
  args: {
    slug: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    displayName: v.optional(v.string()),
    roles: v.optional(v.array(organizationPersonRoleValidator)),
    campusId: v.optional(v.id("campuses")),
  },
  returns: organizationPersonRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const person = await createPerson(ctx, {
      firstName: args.firstName,
      lastName: args.lastName,
      displayName: args.displayName,
      requiredErrorCode: "PROFILE_NAME_REQUIRED",
    });
    const organizationPerson = await upsertOrganizationPerson(ctx, {
      organizationId: access.organization._id,
      personId: person._id,
      isActive: true,
    });

    for (const role of normalizeRoles(args.roles ?? [])) {
      await upsertOrganizationPersonRole(ctx, {
        organizationId: access.organization._id,
        organizationPersonId: organizationPerson._id,
        role,
      });
    }

    if (args.campusId) {
      await upsertOrganizationPersonCampusAssignment(ctx, {
        organizationId: access.organization._id,
        organizationPersonId: organizationPerson._id,
        campusId: args.campusId,
        isPrimary: true,
      });
    }

    return await buildOrganizationPersonRecord(ctx, organizationPerson);
  },
});

export const listOrganizationPeopleByCampus = query({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(organizationPersonCampusRecordValidator),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    await requireCampusInOrganization(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
    });

    const assignmentPage = await ctx.db
      .query("organizationPersonCampusAssignments")
      .withIndex("by_org_id_and_campus_id_and_is_active", (query) =>
        query
          .eq("organizationId", access.organization._id)
          .eq("campusId", args.campusId)
          .eq("isActive", true),
      )
      .paginate(clampPaginationOpts(args.paginationOpts));
    const page = await Promise.all(
      assignmentPage.page.map(async (assignment) => {
        const organizationPerson = await ctx.db.get(
          "organizationPeople",
          assignment.organizationPersonId,
        );
        if (!organizationPerson) {
          return null;
        }

        if (organizationPerson.organizationId !== access.organization._id) {
          return null;
        }

        return {
          assignment,
          person: await buildOrganizationPersonRecord(ctx, organizationPerson),
        };
      }),
    );

    return {
      ...assignmentPage,
      page: page.filter((record) => record !== null),
    };
  },
});

export const deactivateOrganizationPerson = mutation({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
  },
  returns: organizationPersonRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const organizationPerson = await setOrganizationPersonActiveState(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: args.organizationPersonId,
      isActive: false,
    });

    return await buildOrganizationPersonRecord(ctx, organizationPerson);
  },
});

export const reactivateOrganizationPerson = mutation({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
  },
  returns: organizationPersonRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const organizationPerson = await setOrganizationPersonActiveState(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: args.organizationPersonId,
      isActive: true,
    });

    return await buildOrganizationPersonRecord(ctx, organizationPerson);
  },
});

export const updateOrganizationPersonProfile = mutation({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
    firstName: v.string(),
    lastName: v.string(),
    avatarChange: avatarChangeValidator,
  },
  returns: organizationPersonRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const organizationPerson = await requireOrganizationPersonInOrganization(
      ctx,
      {
        organizationId: access.organization._id,
        organizationPersonId: args.organizationPersonId,
      },
    );

    await savePersonProfile(ctx, {
      personId: organizationPerson.personId,
      firstName: args.firstName,
      lastName: args.lastName,
      avatarChange: args.avatarChange,
    });

    return await buildOrganizationPersonRecord(ctx, organizationPerson);
  },
});

export const assignOrganizationPersonToCampus = mutation({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
    campusId: v.id("campuses"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    await upsertOrganizationPersonCampusAssignment(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: args.organizationPersonId,
      campusId: args.campusId,
    });

    return null;
  },
});

export const removeOrganizationPersonFromCampus = mutation({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
    campusId: v.id("campuses"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    await deactivateOrganizationPersonCampusAssignment(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: args.organizationPersonId,
      campusId: args.campusId,
    });

    return null;
  },
});

export const deleteGuardianChild = mutation({
  args: {
    slug: v.string(),
    guardianRelationshipId: v.id("guardianRelationships"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    const relationship = await ctx.db.get(
      "guardianRelationships",
      args.guardianRelationshipId,
    );
    if (
      !relationship ||
      relationship.organizationId !== access.organization._id
    ) {
      throwAppError("GUARDIAN_RELATIONSHIP_NOT_FOUND");
    }

    const studentOrganizationPerson =
      await requireOrganizationPersonInOrganization(ctx, {
        organizationId: access.organization._id,
        organizationPersonId: relationship.studentOrganizationPersonId,
      });

    const [studentRoles, studentUser] = await Promise.all([
      listOrganizationPersonRoles(ctx, {
        organizationId: access.organization._id,
        organizationPersonId: studentOrganizationPerson._id,
      }),
      getUserByPersonId(ctx, studentOrganizationPerson.personId),
    ]);

    if (!studentRoles.includes("student")) {
      throwAppError("ORGANIZATION_PERSON_NOT_FOUND");
    }

    if (!hasOnlyOrganizationPersonRole(studentRoles, "student")) {
      throwAppError("ORGANIZATION_PERSON_HAS_ADDITIONAL_ROLES");
    }

    if (studentUser) {
      throwAppError("ORGANIZATION_PERSON_HAS_LINKED_USER_ACCOUNT");
    }

    await setOrganizationPersonActiveState(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: studentOrganizationPerson._id,
      isActive: false,
    });

    await deleteGuardianRelationship(ctx, {
      organizationId: access.organization._id,
      guardianRelationshipId: relationship._id,
    });

    const shouldContinueCleanup = await deleteGuardianChildRowsBatch(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: studentOrganizationPerson._id,
    });

    if (shouldContinueCleanup) {
      await scheduleGuardianChildCleanup(ctx, {
        organizationId: access.organization._id,
        organizationPersonId: studentOrganizationPerson._id,
      });
    }

    return null;
  },
});

export const deleteGuardianChildCleanupInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const shouldContinueCleanup = await deleteGuardianChildRowsBatch(ctx, args);

    if (shouldContinueCleanup) {
      await scheduleGuardianChildCleanup(ctx, args);
    }

    return null;
  },
});

export const createGuardianChild = mutation({
  args: {
    slug: v.string(),
    guardianOrganizationPersonId: v.id("organizationPeople"),
    profile: academicPersonProfileInputValidator,
  },
  returns: organizationPersonChildProfileRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    await requireOrganizationPersonInOrganization(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: args.guardianOrganizationPersonId,
    });

    const existingRelationships = await listGuardianRelationshipsForGuardian(
      ctx,
      {
        organizationId: access.organization._id,
        guardianOrganizationPersonId: args.guardianOrganizationPersonId,
      },
    );
    if (existingRelationships.length >= MAX_STUDENTS_PER_GUARDIAN_ACCOUNT) {
      throwAppError("GUARDIAN_STUDENT_COUNT_INVALID");
    }

    const child = await createOrganizationPersonWithRole(ctx, {
      organizationId: access.organization._id,
      profile: args.profile,
      role: "student",
      campusId: args.profile.campusId,
    });
    const relationship = await upsertGuardianRelationship(ctx, {
      organizationId: access.organization._id,
      guardianOrganizationPersonId: args.guardianOrganizationPersonId,
      studentOrganizationPersonId: child.organizationPerson._id,
      relationshipType: "guardian",
      isPrimary: existingRelationships.length === 0,
    });
    const childRecord = await buildGuardianChildProfileRecord(ctx, {
      organizationId: access.organization._id,
      relationship,
    });

    if (!childRecord) {
      throwAppError("GUARDIAN_RELATIONSHIP_NOT_FOUND");
    }

    return childRecord;
  },
});

export const listOrganizationPeople = query({
  args: {
    slug: v.string(),
    paginationOpts: paginationOptsValidator,
    roleFilter: v.union(organizationPersonRoleValidator, v.null()),
    activeFilter: organizationPeopleActiveFilterValidator,
  },
  returns: paginationResultValidator(organizationPersonListRecordValidator),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    if (args.roleFilter !== null) {
      const roleFilter = args.roleFilter;
      const rolePage =
        args.activeFilter === "all"
          ? await ctx.db
              .query("organizationPersonRoles")
              .withIndex("by_organization_id_and_role", (query) =>
                query
                  .eq("organizationId", access.organization._id)
                  .eq("role", roleFilter),
              )
              .paginate(clampPaginationOpts(args.paginationOpts))
          : await ctx.db
              .query("organizationPersonRoles")
              .withIndex("by_org_id_and_role_and_op_is_active", (query) =>
                query
                  .eq("organizationId", access.organization._id)
                  .eq("role", roleFilter)
                  .eq(
                    "organizationPersonIsActive",
                    args.activeFilter === "active",
                  ),
              )
              .paginate(clampPaginationOpts(args.paginationOpts));
      const page = await Promise.all(
        rolePage.page.map(async (roleRecord) => {
          const organizationPerson = await ctx.db.get(
            "organizationPeople",
            roleRecord.organizationPersonId,
          );
          if (
            !organizationPerson ||
            organizationPerson.organizationId !== access.organization._id
          ) {
            return null;
          }

          return await buildOrganizationPersonListRecord(ctx, {
            accountMode:
              roleFilter === "teacher" ? "selfOnly" : "withGuardianFallback",
            organizationId: access.organization._id,
            organizationPerson,
          });
        }),
      );

      return {
        ...rolePage,
        page: page.filter((record) => record !== null),
      };
    }

    const organizationPeopleQuery =
      args.activeFilter === "all"
        ? ctx.db
            .query("organizationPeople")
            .withIndex("by_organization_id_and_person_id", (query) =>
              query.eq("organizationId", access.organization._id),
            )
        : ctx.db
            .query("organizationPeople")
            .withIndex(
              "by_organization_id_and_is_active_and_person_id",
              (query) =>
                query
                  .eq("organizationId", access.organization._id)
                  .eq("isActive", args.activeFilter === "active"),
            );
    const organizationPeoplePage = await organizationPeopleQuery.paginate(
      clampPaginationOpts(args.paginationOpts),
    );

    return {
      ...organizationPeoplePage,
      page: await Promise.all(
        organizationPeoplePage.page.map((organizationPerson) =>
          buildOrganizationPersonListRecord(ctx, {
            organizationId: access.organization._id,
            organizationPerson,
          }),
        ),
      ),
    };
  },
});

export const getStudentProfile = query({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
  },
  returns: organizationPersonProfileRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const selectedStudentOrganizationPerson =
      await requireStudentOrganizationPerson(ctx, {
        organizationId: access.organization._id,
        organizationPersonId: args.organizationPersonId,
      });
    const selectedStudent = await buildOrganizationPersonRecord(
      ctx,
      selectedStudentOrganizationPerson,
    );
    const guardianRelationships = await listGuardianRelationshipsForStudent(
      ctx,
      {
        organizationId: access.organization._id,
        studentOrganizationPersonId: selectedStudentOrganizationPerson._id,
      },
    );

    const guardians = (
      await Promise.all(
        guardianRelationships.map(async (relationship) => {
          const guardianOrganizationPerson = await ctx.db.get(
            relationship.guardianOrganizationPersonId,
          );
          if (
            !guardianOrganizationPerson ||
            guardianOrganizationPerson.organizationId !==
              access.organization._id
          ) {
            return null;
          }

          const [guardian, guardianUser] = await Promise.all([
            buildOrganizationPersonRecord(ctx, guardianOrganizationPerson),
            getUserByPersonId(ctx, guardianOrganizationPerson.personId),
          ]);

          return {
            relationship,
            guardian,
            account: buildAccountSummary(guardianUser),
          };
        }),
      )
    ).filter((record) => record !== null);

    const account = await getOrganizationPersonAccountSummary(ctx, {
      organizationId: access.organization._id,
      organizationPerson: selectedStudentOrganizationPerson,
    });
    const canManageProfile =
      access.isPlatformAdmin ||
      hasOrganizationRole(access.effectiveRole, "admin");
    const profileOwnerOrganizationPerson =
      account.kind === "guardian"
        ? await requireOrganizationPersonInOrganization(ctx, {
            organizationId: access.organization._id,
            organizationPersonId: account.guardianOrganizationPersonId,
          })
        : selectedStudentOrganizationPerson;
    const person =
      account.kind === "guardian"
        ? await buildOrganizationPersonRecord(
            ctx,
            profileOwnerOrganizationPerson,
          )
        : selectedStudent;
    const children =
      account.kind === "guardian"
        ? await listGuardianChildProfileRecords(ctx, {
            organizationId: access.organization._id,
            guardianOrganizationPersonId: profileOwnerOrganizationPerson._id,
          })
        : [];
    const campusAssignments =
      account.kind === "guardian"
        ? children.flatMap((child) =>
            child.campusAssignments.map((campusAssignment) => ({
              ...campusAssignment,
              student: child.student,
            })),
          )
        : await buildCampusAssignmentProfileRecords(ctx, {
            organizationId: access.organization._id,
            organizationPerson: selectedStudentOrganizationPerson,
          });
    const passwordResetTarget = canManageProfile
      ? await getOrganizationPersonPasswordResetTarget(ctx, {
          organizationId: access.organization._id,
          organizationPerson: profileOwnerOrganizationPerson,
        })
      : null;
    const guardianPin =
      account.kind === "guardian"
        ? await getOrganizationPersonPin(ctx, {
            organizationId: access.organization._id,
            organizationPersonId: profileOwnerOrganizationPerson._id,
          })
        : null;

    return {
      person,
      account,
      campusAssignments,
      guardians,
      children,
      profileOwnerKind:
        account.kind === "guardian"
          ? ("guardian" as const)
          : ("student" as const),
      selectedStudentOrganizationPersonId:
        selectedStudentOrganizationPerson._id,
      canManageProfile,
      canManagePassword: passwordResetTarget !== null,
      canManagePin: account.kind === "guardian" && canManageProfile,
      hasPin: guardianPin !== null,
    };
  },
});

export const getTeacherProfile = query({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
  },
  returns: organizationPersonProfileRecordValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const organizationPerson = await requireTeacherOrganizationPerson(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: args.organizationPersonId,
    });
    const person = await buildOrganizationPersonRecord(
      ctx,
      organizationPerson,
    );
    const account =
      (await getOrganizationPersonSelfAccountSummary(ctx, {
        organizationId: access.organization._id,
        organizationPerson,
      })) ?? {
        kind: "none" as const,
      };
    const canManageProfile =
      access.isPlatformAdmin ||
      hasOrganizationRole(access.effectiveRole, "admin");
    const passwordResetTarget = canManageProfile
      ? await getOrganizationPersonSelfPasswordResetTarget(ctx, {
          organizationId: access.organization._id,
          organizationPerson,
        })
      : null;

    return {
      person,
      account,
      campusAssignments: await buildCampusAssignmentProfileRecords(ctx, {
        organizationId: access.organization._id,
        organizationPerson,
      }),
      guardians: [],
      children: [],
      profileOwnerKind: "teacher" as const,
      selectedStudentOrganizationPersonId: organizationPerson._id,
      canManageProfile,
      canManagePassword: passwordResetTarget !== null,
      canManagePin: false,
      hasPin: false,
    };
  },
});

export const getOrganizationPersonPasswordResetTargetInternal = internalQuery({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
    accountScope: v.optional(passwordResetAccountScopeValidator),
  },
  returns: v.union(organizationPersonPasswordResetTargetValidator, v.null()),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const organizationPerson = await requireOrganizationPersonInOrganization(
      ctx,
      {
        organizationId: access.organization._id,
        organizationPersonId: args.organizationPersonId,
      },
    );

    const targetArgs = {
      organizationId: access.organization._id,
      organizationPerson,
    };

    return args.accountScope === "self"
      ? await getOrganizationPersonSelfPasswordResetTarget(ctx, targetArgs)
      : await getOrganizationPersonPasswordResetTarget(ctx, targetArgs);
  },
});

export const resetGuardianProfilePin = mutation({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
    newPin: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const organizationPerson = await requireGuardianOrganizationPerson(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: args.organizationPersonId,
    });

    await setOrganizationPersonPin(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: organizationPerson._id,
      pin: args.newPin,
    });
    await invalidateOrganizationPersonProfileUnlocks(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: organizationPerson._id,
    });

    return null;
  },
});
