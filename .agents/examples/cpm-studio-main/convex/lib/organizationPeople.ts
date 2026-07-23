import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_GUARDIAN_STUDENT_PROFILES } from "../../lib/people/academic-limits";
import { requireCampusInOrganization } from "./campuses";
import { throwAppError } from "./errors";
import { requireOrganizationById } from "./organizations";
import {
  createPerson,
  deleteStoredAvatarIfPresent,
  getEffectivePersonAvatarUrl,
  getPersonDisplayName,
  requirePersonById,
} from "./people";
import {
  deleteOrganizationPersonPinsForOrganizationPersonBatch,
  deleteOrganizationPersonProfileUnlocksForOrganizationPersonBatch,
} from "./profilePins";
import { ORGANIZATION_PERSON_DELETION_BATCH_SIZE } from "./queryLimits";
import { getUserByPersonId } from "./users";

type Context = QueryCtx | MutationCtx;
const MAX_CAMPUS_ASSIGNMENTS_PER_PERSON = 50;
const MAX_GUARDIAN_RELATIONSHIPS_PER_PERSON = 50;
export const MAX_STUDENTS_PER_GUARDIAN_ACCOUNT = MAX_GUARDIAN_STUDENT_PROFILES;
const ORGANIZATION_PERSON_ROLE_ORDER: Record<
  Doc<"organizationPersonRoles">["role"],
  number
> = {
  student: 0,
  teacher: 1,
  guardian: 2,
  staff: 3,
  applicant: 4,
};

export async function getOrganizationPersonByPerson(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"people">;
  },
) {
  return await ctx.db
    .query("organizationPeople")
    .withIndex("by_organization_id_and_person_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("personId", args.personId),
    )
    .unique();
}

export async function listOrganizationPeopleForPerson(
  ctx: Context,
  personId: Id<"people">,
) {
  return await ctx.db
    .query("organizationPeople")
    .withIndex("by_person_id", (query) => query.eq("personId", personId))
    .take(2);
}

async function syncOrganizationPersonRoleActiveState(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    isActive: boolean;
    updatedAt: number;
  },
) {
  const roleRecords = await listOrganizationPersonRoleRecords(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
  });

  for (const roleRecord of roleRecords) {
    if (roleRecord.organizationPersonIsActive === args.isActive) {
      continue;
    }

    await ctx.db.patch("organizationPersonRoles", roleRecord._id, {
      organizationPersonIsActive: args.isActive,
      updatedAt: args.updatedAt,
    });
  }
}

export async function requireOrganizationPersonInOrganization(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  const organizationPerson = await ctx.db.get(
    "organizationPeople",
    args.organizationPersonId,
  );
  if (!organizationPerson) {
    throwAppError("ORGANIZATION_PERSON_NOT_FOUND");
  }

  if (organizationPerson.organizationId !== args.organizationId) {
    throwAppError("ORGANIZATION_PERSON_SCOPE_MISMATCH");
  }

  return organizationPerson;
}

export async function upsertOrganizationPerson(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"people">;
    isActive?: boolean;
  },
) {
  await requireOrganizationById(ctx, args.organizationId);
  await requirePersonById(ctx, args.personId);

  const existingOrganizationPerson = await getOrganizationPersonByPerson(
    ctx,
    args,
  );
  const now = Date.now();

  if (existingOrganizationPerson) {
    const nextIsActive = args.isActive ?? existingOrganizationPerson.isActive;

    await ctx.db.patch("organizationPeople", existingOrganizationPerson._id, {
      isActive: nextIsActive,
      updatedAt: now,
    });
    await syncOrganizationPersonRoleActiveState(ctx, {
      organizationId: args.organizationId,
      organizationPersonId: existingOrganizationPerson._id,
      isActive: nextIsActive,
      updatedAt: now,
    });

    const organizationPerson = await ctx.db.get(
      "organizationPeople",
      existingOrganizationPerson._id,
    );
    if (!organizationPerson) {
      throwAppError("ORGANIZATION_PERSON_NOT_FOUND");
    }

    return organizationPerson;
  }

  const organizationPersonId = await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    personId: args.personId,
    isActive: args.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  });

  const organizationPerson = await ctx.db.get(
    "organizationPeople",
    organizationPersonId,
  );
  if (!organizationPerson) {
    throwAppError("ORGANIZATION_PERSON_NOT_FOUND");
  }

  return organizationPerson;
}

export async function getOrganizationPersonCampusAssignment(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    campusId: Id<"campuses">;
  },
) {
  // Uniqueness is maintained by the upsert flow; Convex indexes do not enforce it.
  return await ctx.db
    .query("organizationPersonCampusAssignments")
    .withIndex("by_org_id_and_op_id_and_campus_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId)
        .eq("campusId", args.campusId),
    )
    .unique();
}

export async function listActiveCampusAssignmentsForOrganizationPerson(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  return await ctx.db
    .query("organizationPersonCampusAssignments")
    .withIndex("by_org_id_and_op_id_and_is_active", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId)
        .eq("isActive", true),
    )
    // This mirrors the write cap. Hitting the cap means the data is still valid;
    // the write path is where we prevent creating more active assignments.
    .take(MAX_CAMPUS_ASSIGNMENTS_PER_PERSON);
}

export async function listCampusAssignmentsForOrganizationPerson(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
  limit = MAX_CAMPUS_ASSIGNMENTS_PER_PERSON,
) {
  return await ctx.db
    .query("organizationPersonCampusAssignments")
    .withIndex("by_org_id_and_op_id_and_campus_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId),
    )
    .take(limit);
}

async function clearOtherPrimaryCampusAssignments(
  ctx: MutationCtx,
  args: {
    activeAssignments: Array<Doc<"organizationPersonCampusAssignments">>;
    exceptAssignmentId?: Id<"organizationPersonCampusAssignments">;
    now: number;
  },
) {
  await Promise.all(
    args.activeAssignments.map(async (assignment) => {
      if (!assignment.isPrimary || assignment._id === args.exceptAssignmentId) {
        return;
      }

      await ctx.db.patch(
        "organizationPersonCampusAssignments",
        assignment._id,
        {
          isPrimary: false,
          updatedAt: args.now,
        },
      );
    }),
  );
}

export async function upsertOrganizationPersonCampusAssignment(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    campusId: Id<"campuses">;
    isPrimary?: boolean;
    // Internal escape hatch used by assignment lifecycle helpers. Public APIs
    // should prefer explicit assign/unassign mutations.
    isActive?: boolean;
  },
) {
  await requireOrganizationPersonInOrganization(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
  });
  await requireCampusInOrganization(ctx, {
    organizationId: args.organizationId,
    campusId: args.campusId,
  });

  const now = Date.now();
  const existingAssignment = await getOrganizationPersonCampusAssignment(
    ctx,
    args,
  );
  const activeAssignments =
    await listActiveCampusAssignmentsForOrganizationPerson(ctx, args);
  const nextIsActive = args.isActive ?? true;
  const isActivatingAssignment =
    nextIsActive && (!existingAssignment || !existingAssignment.isActive);

  if (
    isActivatingAssignment &&
    activeAssignments.length >= MAX_CAMPUS_ASSIGNMENTS_PER_PERSON
  ) {
    throwAppError("ORGANIZATION_PERSON_CAMPUS_ASSIGNMENT_LIMIT_EXCEEDED");
  }

  let nextIsPrimary = false;
  if (nextIsActive) {
    if (args.isPrimary !== undefined) {
      nextIsPrimary = args.isPrimary;
    } else if (existingAssignment?.isActive) {
      nextIsPrimary = existingAssignment.isPrimary;
    } else {
      nextIsPrimary = activeAssignments.length === 0;
    }
  }

  if (nextIsPrimary) {
    await clearOtherPrimaryCampusAssignments(ctx, {
      activeAssignments,
      exceptAssignmentId: existingAssignment?._id,
      now,
    });
  }

  if (existingAssignment) {
    await ctx.db.patch(
      "organizationPersonCampusAssignments",
      existingAssignment._id,
      {
        isPrimary: nextIsPrimary,
        isActive: nextIsActive,
        updatedAt: now,
      },
    );

    const assignment = await ctx.db.get(
      "organizationPersonCampusAssignments",
      existingAssignment._id,
    );
    if (!assignment) {
      throwAppError("ORGANIZATION_PERSON_CAMPUS_ASSIGNMENT_NOT_FOUND");
    }

    return assignment;
  }

  const assignmentId = await ctx.db.insert(
    "organizationPersonCampusAssignments",
    {
      organizationId: args.organizationId,
      organizationPersonId: args.organizationPersonId,
      campusId: args.campusId,
      isPrimary: nextIsPrimary,
      isActive: nextIsActive,
      createdAt: now,
      updatedAt: now,
    },
  );
  const assignment = await ctx.db.get(
    "organizationPersonCampusAssignments",
    assignmentId,
  );
  if (!assignment) {
    throwAppError("ORGANIZATION_PERSON_CAMPUS_ASSIGNMENT_NOT_FOUND");
  }

  return assignment;
}

export async function deactivateOrganizationPersonCampusAssignment(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    campusId: Id<"campuses">;
  },
) {
  await requireOrganizationPersonInOrganization(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
  });
  await requireCampusInOrganization(ctx, {
    organizationId: args.organizationId,
    campusId: args.campusId,
  });

  const assignment = await getOrganizationPersonCampusAssignment(ctx, args);
  if (!assignment || !assignment.isActive) {
    return null;
  }

  const now = Date.now();
  await ctx.db.patch("organizationPersonCampusAssignments", assignment._id, {
    isActive: false,
    isPrimary: false,
    updatedAt: now,
  });

  if (assignment.isPrimary) {
    const activeAssignments =
      await listActiveCampusAssignmentsForOrganizationPerson(ctx, args);
    const nextPrimaryAssignment = activeAssignments[0];

    if (nextPrimaryAssignment) {
      await ctx.db.patch(
        "organizationPersonCampusAssignments",
        nextPrimaryAssignment._id,
        {
          isPrimary: true,
          updatedAt: now,
        },
      );
    }
  }

  const deactivatedAssignment = await ctx.db.get(
    "organizationPersonCampusAssignments",
    assignment._id,
  );
  if (!deactivatedAssignment) {
    throwAppError("ORGANIZATION_PERSON_CAMPUS_ASSIGNMENT_NOT_FOUND");
  }

  return deactivatedAssignment;
}

export async function upsertOrganizationPersonRole(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    role: Doc<"organizationPersonRoles">["role"];
  },
) {
  const organizationPerson = await requireOrganizationPersonInOrganization(
    ctx,
    {
      organizationId: args.organizationId,
      organizationPersonId: args.organizationPersonId,
    },
  );

  const existingRole = await ctx.db
    .query("organizationPersonRoles")
    .withIndex("by_organization_person_id_and_role", (query) =>
      query
        .eq("organizationPersonId", args.organizationPersonId)
        .eq("role", args.role),
    )
    .unique();
  const now = Date.now();

  if (existingRole) {
    if (existingRole.organizationId !== args.organizationId) {
      throwAppError("ORGANIZATION_PERSON_SCOPE_MISMATCH");
    }

    await ctx.db.patch("organizationPersonRoles", existingRole._id, {
      organizationPersonIsActive: organizationPerson.isActive,
      updatedAt: now,
    });

    const organizationPersonRole = await ctx.db.get(
      "organizationPersonRoles",
      existingRole._id,
    );
    if (!organizationPersonRole) {
      throwAppError("ORGANIZATION_PERSON_ROLE_NOT_FOUND");
    }

    return organizationPersonRole;
  }

  const organizationPersonRoleId = await ctx.db.insert(
    "organizationPersonRoles",
    {
      organizationId: args.organizationId,
      organizationPersonId: args.organizationPersonId,
      role: args.role,
      organizationPersonIsActive: organizationPerson.isActive,
      createdAt: now,
      updatedAt: now,
    },
  );

  const organizationPersonRole = await ctx.db.get(
    "organizationPersonRoles",
    organizationPersonRoleId,
  );
  if (!organizationPersonRole) {
    throwAppError("ORGANIZATION_PERSON_ROLE_NOT_FOUND");
  }

  return organizationPersonRole;
}

function requireAcademicProfileNameParts(args: {
  firstName: string;
  lastName: string;
}) {
  if (!args.firstName.trim() || !args.lastName.trim()) {
    throwAppError("PROFILE_NAME_REQUIRED");
  }
}

export async function createOrganizationPersonWithRole(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    profile: {
      firstName: string;
      lastName: string;
      displayName?: string;
      imageStorageId?: Id<"_storage">;
    };
    role: Doc<"organizationPersonRoles">["role"];
    campusId?: Id<"campuses">;
  },
) {
  requireAcademicProfileNameParts(args.profile);

  const person = await createPerson(ctx, {
    firstName: args.profile.firstName,
    lastName: args.profile.lastName,
    displayName: args.profile.displayName,
    imageStorageId: args.profile.imageStorageId,
    requiredErrorCode: "PROFILE_NAME_REQUIRED",
  });
  const organizationPerson = await upsertOrganizationPerson(ctx, {
    organizationId: args.organizationId,
    personId: person._id,
    isActive: true,
  });

  await upsertOrganizationPersonRole(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: organizationPerson._id,
    role: args.role,
  });

  if (args.campusId) {
    await upsertOrganizationPersonCampusAssignment(ctx, {
      organizationId: args.organizationId,
      organizationPersonId: organizationPerson._id,
      campusId: args.campusId,
      isPrimary: true,
    });
  }

  return {
    person,
    organizationPerson,
  };
}

export async function listOrganizationPersonRoleRecords(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
  limit = 10,
) {
  return await ctx.db
    .query("organizationPersonRoles")
    .withIndex("by_organization_id_and_organization_person_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId),
    )
    .take(limit);
}

export async function listOrganizationPersonRoles(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  const roleRecords = await listOrganizationPersonRoleRecords(ctx, args);

  return roleRecords
    .map((roleRecord) => roleRecord.role)
    .sort((left, right) => {
      return (
        ORGANIZATION_PERSON_ROLE_ORDER[left] -
        ORGANIZATION_PERSON_ROLE_ORDER[right]
      );
    });
}

export async function buildOrganizationPersonRecord(
  ctx: Context,
  organizationPerson: Doc<"organizationPeople">,
) {
  const person = await requirePersonById(ctx, organizationPerson.personId);
  const roles = await listOrganizationPersonRoles(ctx, {
    organizationId: organizationPerson.organizationId,
    organizationPersonId: organizationPerson._id,
  });

  return {
    _id: organizationPerson._id,
    _creationTime: organizationPerson._creationTime,
    organizationId: organizationPerson.organizationId,
    personId: organizationPerson.personId,
    isActive: organizationPerson.isActive,
    createdAt: organizationPerson.createdAt,
    updatedAt: organizationPerson.updatedAt,
    firstName: person.firstName,
    lastName: person.lastName,
    displayName: person.displayName,
    name: getPersonDisplayName(person) ?? "",
    avatarUrl: await getEffectivePersonAvatarUrl(ctx, {
      person,
      fallbackImage: null,
    }),
    roles,
  };
}

export async function listGuardianRelationshipsForStudent(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    studentOrganizationPersonId: Id<"organizationPeople">;
  },
  limit = MAX_GUARDIAN_RELATIONSHIPS_PER_PERSON,
) {
  return await ctx.db
    .query("guardianRelationships")
    .withIndex(
      "by_organization_id_and_student_organization_person_id",
      (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("studentOrganizationPersonId", args.studentOrganizationPersonId),
    )
    .take(limit);
}

export async function listGuardianRelationshipsForGuardian(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    guardianOrganizationPersonId: Id<"organizationPeople">;
  },
  limit = MAX_GUARDIAN_RELATIONSHIPS_PER_PERSON,
) {
  return await ctx.db
    .query("guardianRelationships")
    .withIndex(
      "by_org_id_and_guardian_op_id_and_student_op_id_and_type",
      (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq(
            "guardianOrganizationPersonId",
            args.guardianOrganizationPersonId,
          ),
    )
    .take(limit);
}

export async function getGuardianRelationshipForGuardianAndStudent(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    guardianOrganizationPersonId: Id<"organizationPeople">;
    studentOrganizationPersonId: Id<"organizationPeople">;
  },
) {
  const relationships = await ctx.db
    .query("guardianRelationships")
    .withIndex(
      "by_org_id_and_guardian_op_id_and_student_op_id_and_type",
      (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("guardianOrganizationPersonId", args.guardianOrganizationPersonId)
          .eq("studentOrganizationPersonId", args.studentOrganizationPersonId),
    )
    .take(1);

  return relationships[0] ?? null;
}

export async function deleteGuardianRelationship(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    guardianRelationshipId: Id<"guardianRelationships">;
  },
) {
  const guardianRelationship = await ctx.db.get(
    "guardianRelationships",
    args.guardianRelationshipId,
  );
  if (!guardianRelationship) {
    throwAppError("GUARDIAN_RELATIONSHIP_NOT_FOUND");
  }

  if (guardianRelationship.organizationId !== args.organizationId) {
    throwAppError("GUARDIAN_RELATIONSHIP_NOT_FOUND");
  }

  await ctx.db.delete("guardianRelationships", guardianRelationship._id);

  return guardianRelationship;
}

async function listOrganizationPersonActivityDaysForDeleteBatch(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
  batchSize = ORGANIZATION_PERSON_DELETION_BATCH_SIZE,
) {
  return await ctx.db
    .query("organizationPersonActivityDays")
    .withIndex(
      "by_organization_id_and_organization_person_id_and_activity_date",
      (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("organizationPersonId", args.organizationPersonId),
    )
    .take(batchSize);
}

export async function deleteOrganizationPersonCoreProfileBatch(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
  batchSize = ORGANIZATION_PERSON_DELETION_BATCH_SIZE,
) {
  const organizationPerson = await ctx.db.get(
    "organizationPeople",
    args.organizationPersonId,
  );
  if (!organizationPerson) {
    return {
      deletedGuardianRelationshipCount: 0,
      deletedOrganizationPersonRoleCount: 0,
      deletedOrganizationPersonCampusAssignmentCount: 0,
      deletedOrganizationPersonActivityDayCount: 0,
      deletedOrganizationPersonPinCount: 0,
      deletedOrganizationPersonProfileUnlockCount: 0,
      deletedOrganizationPersonCount: 0,
      deletedPersonCount: 0,
    };
  }

  if (organizationPerson.organizationId !== args.organizationId) {
    throwAppError("ORGANIZATION_PERSON_SCOPE_MISMATCH");
  }

  const person = await ctx.db.get("people", organizationPerson.personId);
  const [
    guardianRelationships,
    studentRelationships,
    roles,
    campusAssignments,
    activityDays,
    deletedOrganizationPersonPinCount,
    deletedOrganizationPersonProfileUnlockCount,
    linkedUser,
    organizationPeopleForPerson,
  ] = await Promise.all([
    listGuardianRelationshipsForGuardian(
      ctx,
      {
        organizationId: args.organizationId,
        guardianOrganizationPersonId: organizationPerson._id,
      },
      batchSize,
    ),
    listGuardianRelationshipsForStudent(
      ctx,
      {
        organizationId: args.organizationId,
        studentOrganizationPersonId: organizationPerson._id,
      },
      batchSize,
    ),
    listOrganizationPersonRoleRecords(
      ctx,
      {
        organizationId: args.organizationId,
        organizationPersonId: organizationPerson._id,
      },
      batchSize,
    ),
    listCampusAssignmentsForOrganizationPerson(
      ctx,
      {
        organizationId: args.organizationId,
        organizationPersonId: organizationPerson._id,
      },
      batchSize,
    ),
    listOrganizationPersonActivityDaysForDeleteBatch(
      ctx,
      {
        organizationId: args.organizationId,
        organizationPersonId: organizationPerson._id,
      },
      batchSize,
    ),
    deleteOrganizationPersonPinsForOrganizationPersonBatch(
      ctx,
      {
        organizationId: args.organizationId,
        organizationPersonId: organizationPerson._id,
      },
      batchSize,
    ),
    deleteOrganizationPersonProfileUnlocksForOrganizationPersonBatch(
      ctx,
      {
        organizationId: args.organizationId,
        organizationPersonId: organizationPerson._id,
      },
      batchSize,
    ),
    getUserByPersonId(ctx, organizationPerson.personId),
    listOrganizationPeopleForPerson(ctx, organizationPerson.personId),
  ]);

  if (linkedUser) {
    throwAppError("ORGANIZATION_PERSON_HAS_LINKED_USER_ACCOUNT");
  }

  const relationshipsById = new Map(
    [...guardianRelationships, ...studentRelationships].map((relationship) => [
      relationship._id,
      relationship,
    ]),
  );

  for (const relationship of relationshipsById.values()) {
    await ctx.db.delete("guardianRelationships", relationship._id);
  }

  for (const role of roles) {
    await ctx.db.delete("organizationPersonRoles", role._id);
  }

  for (const assignment of campusAssignments) {
    await ctx.db.delete("organizationPersonCampusAssignments", assignment._id);
  }

  for (const activityDay of activityDays) {
    await ctx.db.delete("organizationPersonActivityDays", activityDay._id);
  }

  const deletedGuardianAsGuardianRelationshipCount =
    guardianRelationships.length;
  const deletedGuardianAsStudentRelationshipCount =
    studentRelationships.length;
  const deletedGuardianRelationshipCount = relationshipsById.size;
  const deletedOrganizationPersonRoleCount = roles.length;
  const deletedOrganizationPersonCampusAssignmentCount =
    campusAssignments.length;
  const deletedOrganizationPersonActivityDayCount = activityDays.length;
  const hasMoreDependentRows = [
    deletedGuardianAsGuardianRelationshipCount,
    deletedGuardianAsStudentRelationshipCount,
    deletedOrganizationPersonRoleCount,
    deletedOrganizationPersonCampusAssignmentCount,
    deletedOrganizationPersonActivityDayCount,
    deletedOrganizationPersonPinCount,
    deletedOrganizationPersonProfileUnlockCount,
  ].some((deletedCount) => deletedCount === batchSize);

  if (hasMoreDependentRows) {
    return {
      deletedGuardianRelationshipCount,
      deletedOrganizationPersonRoleCount,
      deletedOrganizationPersonCampusAssignmentCount,
      deletedOrganizationPersonActivityDayCount,
      deletedOrganizationPersonPinCount,
      deletedOrganizationPersonProfileUnlockCount,
      deletedOrganizationPersonCount: 0,
      deletedPersonCount: 0,
    };
  }

  await ctx.db.delete("organizationPeople", organizationPerson._id);

  const isOnlyOrganizationProfileForPerson =
    organizationPeopleForPerson.length === 1 &&
    organizationPeopleForPerson[0]._id === organizationPerson._id;

  if (person && isOnlyOrganizationProfileForPerson) {
    await deleteStoredAvatarIfPresent(ctx, person.imageStorageId);
    await ctx.db.delete("people", person._id);
  }

  return {
    deletedGuardianRelationshipCount,
    deletedOrganizationPersonRoleCount,
    deletedOrganizationPersonCampusAssignmentCount,
    deletedOrganizationPersonActivityDayCount,
    deletedOrganizationPersonPinCount,
    deletedOrganizationPersonProfileUnlockCount,
    deletedOrganizationPersonCount: 1,
    deletedPersonCount: person && isOnlyOrganizationProfileForPerson ? 1 : 0,
  };
}

export async function setOrganizationPersonActiveState(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    isActive: boolean;
  },
) {
  const organizationPerson = await requireOrganizationPersonInOrganization(
    ctx,
    {
      organizationId: args.organizationId,
      organizationPersonId: args.organizationPersonId,
    },
  );
  const now = Date.now();

  await ctx.db.patch("organizationPeople", organizationPerson._id, {
    isActive: args.isActive,
    updatedAt: now,
  });
  await syncOrganizationPersonRoleActiveState(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: organizationPerson._id,
    isActive: args.isActive,
    updatedAt: now,
  });

  const updatedOrganizationPerson = await ctx.db.get(
    "organizationPeople",
    organizationPerson._id,
  );
  if (!updatedOrganizationPerson) {
    throwAppError("ORGANIZATION_PERSON_NOT_FOUND");
  }

  return updatedOrganizationPerson;
}

export async function upsertGuardianRelationship(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    guardianOrganizationPersonId: Id<"organizationPeople">;
    studentOrganizationPersonId: Id<"organizationPeople">;
    relationshipType: Doc<"guardianRelationships">["relationshipType"];
    isPrimary: boolean;
  },
) {
  const guardianOrganizationPerson =
    await requireOrganizationPersonInOrganization(ctx, {
      organizationId: args.organizationId,
      organizationPersonId: args.guardianOrganizationPersonId,
    });
  const studentOrganizationPerson =
    await requireOrganizationPersonInOrganization(ctx, {
      organizationId: args.organizationId,
      organizationPersonId: args.studentOrganizationPersonId,
    });

  if (guardianOrganizationPerson._id === studentOrganizationPerson._id) {
    throwAppError("GUARDIAN_RELATIONSHIP_SELF_REFERENCE_NOT_ALLOWED");
  }

  const [guardianRoles, studentRoles] = await Promise.all([
    listOrganizationPersonRoles(ctx, {
      organizationId: args.organizationId,
      organizationPersonId: guardianOrganizationPerson._id,
    }),
    listOrganizationPersonRoles(ctx, {
      organizationId: args.organizationId,
      organizationPersonId: studentOrganizationPerson._id,
    }),
  ]);

  if (
    !guardianRoles.includes("guardian") ||
    !studentRoles.includes("student")
  ) {
    throwAppError("GUARDIAN_RELATIONSHIP_ROLE_MISMATCH");
  }

  const existingGuardianRelationship = await ctx.db
    .query("guardianRelationships")
    .withIndex(
      "by_org_id_and_guardian_op_id_and_student_op_id_and_type",
      (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("guardianOrganizationPersonId", args.guardianOrganizationPersonId)
          .eq("studentOrganizationPersonId", args.studentOrganizationPersonId)
          .eq("relationshipType", args.relationshipType),
    )
    .unique();
  const now = Date.now();

  if (existingGuardianRelationship) {
    await ctx.db.patch(
      "guardianRelationships",
      existingGuardianRelationship._id,
      {
        isPrimary: args.isPrimary,
        updatedAt: now,
      },
    );

    const guardianRelationship = await ctx.db.get(
      "guardianRelationships",
      existingGuardianRelationship._id,
    );
    if (!guardianRelationship) {
      throwAppError("GUARDIAN_RELATIONSHIP_NOT_FOUND");
    }

    return guardianRelationship;
  }

  const guardianRelationshipId = await ctx.db.insert("guardianRelationships", {
    organizationId: args.organizationId,
    guardianOrganizationPersonId: args.guardianOrganizationPersonId,
    studentOrganizationPersonId: args.studentOrganizationPersonId,
    relationshipType: args.relationshipType,
    isPrimary: args.isPrimary,
    createdAt: now,
    updatedAt: now,
  });

  const guardianRelationship = await ctx.db.get(
    "guardianRelationships",
    guardianRelationshipId,
  );
  if (!guardianRelationship) {
    throwAppError("GUARDIAN_RELATIONSHIP_NOT_FOUND");
  }

  return guardianRelationship;
}
