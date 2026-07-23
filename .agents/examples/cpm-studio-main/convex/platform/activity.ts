import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  getLatestOrganizationPersonActivityDay,
  getLatestOrganizationUserActivityDay,
  listOrganizationPersonActivityDaysForYear,
  listOrganizationUserActivityDaysForYear,
  recordOrganizationPersonActivity,
  recordOrganizationUserActivity,
} from "../lib/activity";
import {
  requireOrganizationAccess,
  requireOrganizationRole,
} from "../lib/authz";
import {
  getGuardianRelationshipForGuardianAndStudent,
  getOrganizationPersonByPerson,
  requireOrganizationPersonInOrganization,
} from "../lib/organizationPeople";
import {
  organizationUserActivityDayValidator,
  userActivityForYearValidator,
} from "../lib/validators";
import { throwAppError } from "../lib/errors";
import { getUserByPersonId } from "../lib/users";

async function getActorOrganizationPerson(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  },
) {
  const user = await ctx.db.get("users", args.userId);
  if (!user?.personId) {
    return null;
  }

  return await getOrganizationPersonByPerson(ctx, {
    organizationId: args.organizationId,
    personId: user.personId,
  });
}

async function requireRecordableActivityContext(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    userId: Id<"users">;
  },
) {
  const [targetOrganizationPerson, actorOrganizationPerson] = await Promise.all(
    [
      requireOrganizationPersonInOrganization(ctx, {
        organizationId: args.organizationId,
        organizationPersonId: args.organizationPersonId,
      }),
      getActorOrganizationPerson(ctx, {
        organizationId: args.organizationId,
        userId: args.userId,
      }),
    ],
  );

  if (
    !targetOrganizationPerson.isActive ||
    !actorOrganizationPerson?.isActive
  ) {
    throwAppError("UNAUTHORIZED");
  }

  if (actorOrganizationPerson._id === targetOrganizationPerson._id) {
    return targetOrganizationPerson;
  }

  const guardianRelationship =
    await getGuardianRelationshipForGuardianAndStudent(ctx, {
      organizationId: args.organizationId,
      guardianOrganizationPersonId: actorOrganizationPerson._id,
      studentOrganizationPersonId: targetOrganizationPerson._id,
    });

  if (!guardianRelationship) {
    throwAppError("UNAUTHORIZED");
  }

  return targetOrganizationPerson;
}

export const recordTenantActivity = mutation({
  args: {
    slug: v.string(),
    organizationPersonId: v.optional(v.id("organizationPeople")),
    timeZone: v.optional(v.string()),
  },
  returns: organizationUserActivityDayValidator,
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccess(ctx, args.slug);
    const userActivityDay = await recordOrganizationUserActivity(ctx, {
      organizationId: access.organization._id,
      timeZone: args.timeZone,
      userId: access.userId,
    });

    if (args.organizationPersonId) {
      const targetOrganizationPerson = await requireRecordableActivityContext(
        ctx,
        {
          organizationId: access.organization._id,
          organizationPersonId: args.organizationPersonId,
          userId: access.userId,
        },
      );

      await recordOrganizationPersonActivity(ctx, {
        organizationId: access.organization._id,
        organizationPersonId: targetOrganizationPerson._id,
        timeZone: args.timeZone,
      });
    }

    return userActivityDay;
  },
});

async function getOrganizationPersonActivityForYearModel(
  ctx: QueryCtx,
  args: {
    slug: string;
    organizationPersonId: Id<"organizationPeople">;
    year: number;
  },
) {
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

  const selfUser = await getUserByPersonId(ctx, organizationPerson.personId);
  const userId =
    selfUser?.defaultOrganizationId === access.organization._id
      ? selfUser._id
      : null;

  if (userId) {
    const [activityDays, latestActivityDay] = await Promise.all([
      listOrganizationUserActivityDaysForYear(ctx, {
        organizationId: access.organization._id,
        userId,
        year: args.year,
      }),
      getLatestOrganizationUserActivityDay(ctx, {
        organizationId: access.organization._id,
        userId,
      }),
    ]);

    return {
      days: activityDays.map((activityDay) => ({
        date: activityDay.activityDate,
        value: activityDay.activityCount,
      })),
      lastSeenAt: latestActivityDay?.lastSeenAt ?? null,
    };
  }

  const [activityDays, latestActivityDay] = await Promise.all([
    listOrganizationPersonActivityDaysForYear(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: organizationPerson._id,
      year: args.year,
    }),
    getLatestOrganizationPersonActivityDay(ctx, {
      organizationId: access.organization._id,
      organizationPersonId: organizationPerson._id,
    }),
  ]);

  if (activityDays.length === 0 && !latestActivityDay) {
    return {
      days: [],
      lastSeenAt: null,
    };
  }

  return {
    days: activityDays.map((activityDay) => ({
      date: activityDay.activityDate,
      value: activityDay.activityCount,
    })),
    lastSeenAt: latestActivityDay?.lastSeenAt ?? null,
  };
}

export const getOrganizationPersonActivityForYear = query({
  args: {
    slug: v.string(),
    organizationPersonId: v.id("organizationPeople"),
    year: v.number(),
  },
  returns: userActivityForYearValidator,
  handler: async (ctx, args) => {
    return await getOrganizationPersonActivityForYearModel(ctx, {
      slug: args.slug,
      organizationPersonId: args.organizationPersonId,
      year: args.year,
    });
  },
});
