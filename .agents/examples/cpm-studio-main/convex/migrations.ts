import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const migrations = new Migrations<DataModel>(components.migrations);

export const expirePendingPlatformInvitations = migrations.define({
  table: "platformInvitations",
  migrateOne: async (ctx, invitation) => {
    if (invitation.status === "pending" && invitation.expiresAt <= Date.now()) {
      await ctx.db.patch("platformInvitations", invitation._id, {
        status: "expired",
        updatedAt: Date.now(),
      });
    }
  },
});

export const runExpirePendingPlatformInvitations = migrations.runner(
  internal.migrations.expirePendingPlatformInvitations,
);

// Backfill `users.defaultOrganizationId` for users created before the field
// existed. Picks the first active organization the user belongs to (scan
// bounded to a small page; users with more memberships should not exist yet).
export const backfillUsersDefaultOrganization = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    if (user.defaultOrganizationId) {
      return;
    }

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_id_and_organization_id", (query) =>
        query.eq("userId", user._id),
      )
      .take(50);

    for (const membership of memberships) {
      const organization = await ctx.db.get(
        "organizations",
        membership.organizationId,
      );
      if (organization?.isActive) {
        await ctx.db.patch("users", user._id, {
          defaultOrganizationId: organization._id,
        });
        return;
      }
    }
  },
});

export const runBackfillUsersDefaultOrganization = migrations.runner(
  internal.migrations.backfillUsersDefaultOrganization,
);

// Backfill the role-level active digest used by role + status pagination.
// New writes keep this field in sync with `organizationPeople.isActive`.
export const backfillOrganizationPersonRoleActiveState = migrations.define({
  table: "organizationPersonRoles",
  migrateOne: async (ctx, role) => {
    const organizationPerson = await ctx.db.get(role.organizationPersonId);
    if (!organizationPerson) {
      return;
    }

    if (role.organizationPersonIsActive === organizationPerson.isActive) {
      return;
    }

    await ctx.db.patch("organizationPersonRoles", role._id, {
      organizationPersonIsActive: organizationPerson.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const runBackfillOrganizationPersonRoleActiveState = migrations.runner(
  internal.migrations.backfillOrganizationPersonRoleActiveState,
);

// Remove stale role rows whose organization person no longer exists. These
// rows cannot be rendered and can still distort role pagination when no active
// filter is applied.
export const deleteOrphanOrganizationPersonRoles = migrations.define({
  table: "organizationPersonRoles",
  migrateOne: async (ctx, role) => {
    const organizationPerson = await ctx.db.get(role.organizationPersonId);
    if (organizationPerson) {
      return;
    }

    await ctx.db.delete(role._id);
  },
});

export const runDeleteOrphanOrganizationPersonRoles = migrations.runner(
  internal.migrations.deleteOrphanOrganizationPersonRoles,
);

// Guard the denormalized tenant digest on role rows. The write path enforces
// this invariant, but the migration removes pre-existing or manually imported
// rows that would otherwise create cross-tenant role pagination ambiguity.
export const deleteMismatchedOrganizationPersonRoles = migrations.define({
  table: "organizationPersonRoles",
  migrateOne: async (ctx, role) => {
    const organizationPerson = await ctx.db.get(role.organizationPersonId);
    if (
      !organizationPerson ||
      organizationPerson.organizationId === role.organizationId
    ) {
      return;
    }

    await ctx.db.delete(role._id);
  },
});

export const runDeleteMismatchedOrganizationPersonRoles = migrations.runner(
  internal.migrations.deleteMismatchedOrganizationPersonRoles,
);
