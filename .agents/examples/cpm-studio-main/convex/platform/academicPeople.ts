import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import {
  requireOrganizationRole,
  requireOrganizationRoleByUserId,
} from "../lib/authz";
import { throwAppError } from "../lib/errors";
import { deleteStoredImageIfPresent } from "../lib/images";
import {
  createOrganizationPersonWithRole,
  MAX_STUDENTS_PER_GUARDIAN_ACCOUNT,
  upsertGuardianRelationship,
} from "../lib/organizationPeople";
import { getOrganizationBySlug } from "../lib/organizations";
import { normalizeOrganizationInvitationEmail } from "../lib/organizationInvitations";
import { setOrganizationPersonPin } from "../lib/profilePins";
import { academicAccountKindValidator } from "./academicPeopleValidators";

const provisionedAcademicPersonValidator = v.object({
  personId: v.id("people"),
  organizationPersonId: v.id("organizationPeople"),
});

type ProvisionedAcademicPerson = {
  personId: Id<"people">;
  organizationPersonId: Id<"organizationPeople">;
};

async function ensureEmailCanBeProvisioned(ctx: MutationCtx, email: string) {
  const existingUser = await ctx.db
    .query("users")
    .withIndex("email", (query) => query.eq("email", email))
    .unique();

  if (existingUser) {
    throwAppError("ORGANIZATION_PERSON_ACCOUNT_ALREADY_EXISTS");
  }
}

export const generateImageUploadUrl = mutation({
  args: {
    slug: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    return await ctx.storage.generateUploadUrl();
  },
});

export const discardImageUpload = mutation({
  args: {
    slug: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    await deleteStoredImageIfPresent(ctx, args.storageId);
    return null;
  },
});

export const discardAcademicProfileImageUploadsInternal = internalMutation({
  args: {
    storageIds: v.array(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.storageIds.length > MAX_STUDENTS_PER_GUARDIAN_ACCOUNT + 1) {
      throwAppError("IMAGE_UPLOAD_LIMIT_EXCEEDED");
    }

    for (const storageId of args.storageIds) {
      await deleteStoredImageIfPresent(ctx, storageId);
    }

    return null;
  },
});

export const provisionAcademicAccountProfilesInternal = internalMutation({
  args: {
    slug: v.string(),
    email: v.string(),
    provisionedByUserId: v.id("users"),
    accountKind: academicAccountKindValidator,
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    targetPersonId: v.id("people"),
    createdPeople: v.array(provisionedAcademicPersonValidator),
  }),
  handler: async (ctx, args) => {
    const organization = await getOrganizationBySlug(ctx, args.slug);
    if (!organization) {
      throwAppError("ORGANIZATION_NOT_FOUND");
    }

    await requireOrganizationRoleByUserId(ctx, {
      organizationId: organization._id,
      userId: args.provisionedByUserId,
      minimumRole: "admin",
    });

    const email = normalizeOrganizationInvitationEmail(args.email);
    if (!email || !email.includes("@")) {
      throwAppError("ACCOUNT_EMAIL_REQUIRED");
    }

    await ensureEmailCanBeProvisioned(ctx, email);
    const createdPeople: ProvisionedAcademicPerson[] = [];

    async function createTrackedOrganizationPersonWithRole(
      createArgs: Parameters<typeof createOrganizationPersonWithRole>[1],
    ) {
      const created = await createOrganizationPersonWithRole(ctx, createArgs);
      createdPeople.push({
        personId: created.person._id,
        organizationPersonId: created.organizationPerson._id,
      });

      return created;
    }

    if (args.accountKind.kind === "teacher") {
      const teacher = await createTrackedOrganizationPersonWithRole({
        organizationId: organization._id,
        profile: args.accountKind.profile,
        role: "teacher",
        campusId: args.accountKind.profile.campusId,
      });

      return {
        organizationId: organization._id,
        targetPersonId: teacher.person._id,
        createdPeople,
      };
    }

    if (args.accountKind.kind === "selfManagedStudent") {
      const student = await createTrackedOrganizationPersonWithRole({
        organizationId: organization._id,
        profile: args.accountKind.profile,
        role: "student",
        campusId: args.accountKind.profile.campusId,
      });

      return {
        organizationId: organization._id,
        targetPersonId: student.person._id,
        createdPeople,
      };
    }

    if (
      args.accountKind.students.length === 0 ||
      args.accountKind.students.length > MAX_STUDENTS_PER_GUARDIAN_ACCOUNT
    ) {
      throwAppError("GUARDIAN_STUDENT_COUNT_INVALID");
    }

    const guardian = await createTrackedOrganizationPersonWithRole({
      organizationId: organization._id,
      profile: args.accountKind.guardianProfile,
      role: "guardian",
    });
    await setOrganizationPersonPin(ctx, {
      organizationId: organization._id,
      organizationPersonId: guardian.organizationPerson._id,
      pin: args.accountKind.guardianPin,
    });

    for (const [index, studentProfile] of args.accountKind.students.entries()) {
      const student = await createTrackedOrganizationPersonWithRole({
        organizationId: organization._id,
        profile: studentProfile,
        role: "student",
        campusId: studentProfile.campusId,
      });

      await upsertGuardianRelationship(ctx, {
        organizationId: organization._id,
        guardianOrganizationPersonId: guardian.organizationPerson._id,
        studentOrganizationPersonId: student.organizationPerson._id,
        relationshipType: "guardian",
        isPrimary: index === 0,
      });
    }

    return {
      organizationId: organization._id,
      targetPersonId: guardian.person._id,
      createdPeople,
    };
  },
});

export const cleanupProvisionedAcademicAccountProfilesInternal =
  internalMutation({
    args: {
      organizationId: v.id("organizations"),
      createdPeople: v.array(provisionedAcademicPersonValidator),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      for (const createdPerson of args.createdPeople) {
        const guardianRelationships = await ctx.db
          .query("guardianRelationships")
          .withIndex(
            "by_org_id_and_guardian_op_id_and_student_op_id_and_type",
            (query) =>
              query
                .eq("organizationId", args.organizationId)
                .eq(
                  "guardianOrganizationPersonId",
                  createdPerson.organizationPersonId,
                ),
          )
          .take(MAX_STUDENTS_PER_GUARDIAN_ACCOUNT);

        for (const guardianRelationship of guardianRelationships) {
          await ctx.db.delete(
            "guardianRelationships",
            guardianRelationship._id,
          );
        }

        const studentRelationships = await ctx.db
          .query("guardianRelationships")
          .withIndex(
            "by_organization_id_and_student_organization_person_id",
            (query) =>
              query
                .eq("organizationId", args.organizationId)
                .eq(
                  "studentOrganizationPersonId",
                  createdPerson.organizationPersonId,
                ),
          )
          .take(MAX_STUDENTS_PER_GUARDIAN_ACCOUNT);

        for (const studentRelationship of studentRelationships) {
          await ctx.db.delete("guardianRelationships", studentRelationship._id);
        }

        const profilePins = await ctx.db
          .query("organizationPersonPins")
          .withIndex("by_org_id_and_op_id", (query) =>
            query
              .eq("organizationId", args.organizationId)
              .eq("organizationPersonId", createdPerson.organizationPersonId),
          )
          .take(1);

        for (const profilePin of profilePins) {
          await ctx.db.delete("organizationPersonPins", profilePin._id);
        }

        const profileUnlocks = await ctx.db
          .query("organizationPersonProfileUnlocks")
          .withIndex("by_org_id_and_op_id_and_auth_session_id", (query) =>
            query
              .eq("organizationId", args.organizationId)
              .eq("organizationPersonId", createdPerson.organizationPersonId),
          )
          .take(100);

        for (const profileUnlock of profileUnlocks) {
          await ctx.db.delete(
            "organizationPersonProfileUnlocks",
            profileUnlock._id,
          );
        }

        const roles = await ctx.db
          .query("organizationPersonRoles")
          .withIndex("by_organization_id_and_organization_person_id", (query) =>
            query
              .eq("organizationId", args.organizationId)
              .eq("organizationPersonId", createdPerson.organizationPersonId),
          )
          .take(4);

        for (const role of roles) {
          await ctx.db.delete("organizationPersonRoles", role._id);
        }

        const campusAssignments = await ctx.db
          .query("organizationPersonCampusAssignments")
          .withIndex("by_org_id_and_op_id_and_campus_id", (query) =>
            query
              .eq("organizationId", args.organizationId)
              .eq("organizationPersonId", createdPerson.organizationPersonId),
          )
          .take(50);

        for (const campusAssignment of campusAssignments) {
          await ctx.db.delete(
            "organizationPersonCampusAssignments",
            campusAssignment._id,
          );
        }

        const organizationPerson = await ctx.db.get(
          createdPerson.organizationPersonId,
        );
        if (
          organizationPerson &&
          organizationPerson.organizationId === args.organizationId &&
          organizationPerson.personId === createdPerson.personId
        ) {
          await ctx.db.delete("organizationPeople", organizationPerson._id);
        }

        const person = await ctx.db.get(createdPerson.personId);
        if (person) {
          await deleteStoredImageIfPresent(ctx, person.imageStorageId);
          await ctx.db.delete("people", person._id);
        }
      }

      return null;
    },
  });
