import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { throwAppError } from "./errors";

type Context = QueryCtx | MutationCtx;

const ACTIVITY_WRITE_THROTTLE_MS = 5 * 60 * 1000;
const MAX_DAYS_PER_YEAR = 366;
const DEFAULT_ACTIVITY_TIME_ZONE = "UTC";
const MAX_TIME_ZONE_LENGTH = 100;

export function getUtcActivityDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getNormalizedActivityTimeZone(timeZone: string | undefined) {
  if (!timeZone || timeZone.length > MAX_TIME_ZONE_LENGTH) {
    return DEFAULT_ACTIVITY_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return DEFAULT_ACTIVITY_TIME_ZONE;
  }
}

export function getActivityDate(timestamp: number, timeZone?: string) {
  const normalizedTimeZone = getNormalizedActivityTimeZone(timeZone);

  if (normalizedTimeZone === DEFAULT_ACTIVITY_TIME_ZONE) {
    return getUtcActivityDate(timestamp);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: normalizedTimeZone,
    year: "numeric",
  }).formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return getUtcActivityDate(timestamp);
  }

  return `${year}-${month}-${day}`;
}

export function getYearActivityDateRange(year: number) {
  const normalizedYear = Math.trunc(year);

  if (normalizedYear < 2000 || normalizedYear > 2100) {
    throwAppError("INVALID_ACTIVITY_YEAR");
  }

  return {
    endDate: `${normalizedYear}-12-31`,
    startDate: `${normalizedYear}-01-01`,
    year: normalizedYear,
  };
}

export async function getOrganizationUserActivityDay(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    activityDate: string;
  },
) {
  return await ctx.db
    .query("organizationUserActivityDays")
    .withIndex("by_organization_id_and_user_id_and_activity_date", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("userId", args.userId)
        .eq("activityDate", args.activityDate),
    )
    .unique();
}

async function normalizeLegacyUtcOrganizationUserActivityDay(
  ctx: MutationCtx,
  args: {
    activityDate: string;
    now: number;
    organizationId: Id<"organizations">;
    timeZone: string | undefined;
    userId: Id<"users">;
  },
) {
  const utcActivityDate = getUtcActivityDate(args.now);

  if (utcActivityDate === args.activityDate) {
    return;
  }

  const legacyActivityDay = await getOrganizationUserActivityDay(ctx, {
    organizationId: args.organizationId,
    userId: args.userId,
    activityDate: utcActivityDate,
  });
  if (
    !legacyActivityDay ||
    getActivityDate(legacyActivityDay.lastSeenAt, args.timeZone) !==
      args.activityDate
  ) {
    return;
  }

  const localActivityDay = await getOrganizationUserActivityDay(ctx, {
    organizationId: args.organizationId,
    userId: args.userId,
    activityDate: args.activityDate,
  });

  if (localActivityDay) {
    await ctx.db.patch("organizationUserActivityDays", localActivityDay._id, {
      activityCount:
        localActivityDay.activityCount + legacyActivityDay.activityCount,
      firstSeenAt: Math.min(
        localActivityDay.firstSeenAt,
        legacyActivityDay.firstSeenAt,
      ),
      lastSeenAt: Math.max(
        localActivityDay.lastSeenAt,
        legacyActivityDay.lastSeenAt,
      ),
      updatedAt: args.now,
    });
    await ctx.db.delete("organizationUserActivityDays", legacyActivityDay._id);
    return;
  }

  await ctx.db.patch("organizationUserActivityDays", legacyActivityDay._id, {
    activityDate: args.activityDate,
    updatedAt: args.now,
  });
}

export async function recordOrganizationUserActivity(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    timeZone?: string;
    userId: Id<"users">;
    timestamp?: number;
  },
) {
  const now = args.timestamp ?? Date.now();
  const activityDate = getActivityDate(now, args.timeZone);
  await normalizeLegacyUtcOrganizationUserActivityDay(ctx, {
    activityDate,
    now,
    organizationId: args.organizationId,
    timeZone: args.timeZone,
    userId: args.userId,
  });
  const existingActivityDay = await getOrganizationUserActivityDay(ctx, {
    organizationId: args.organizationId,
    userId: args.userId,
    activityDate,
  });

  if (existingActivityDay) {
    if (now - existingActivityDay.lastSeenAt < ACTIVITY_WRITE_THROTTLE_MS) {
      return existingActivityDay;
    }

    await ctx.db.patch(
      "organizationUserActivityDays",
      existingActivityDay._id,
      {
        activityCount: existingActivityDay.activityCount + 1,
        lastSeenAt: now,
        updatedAt: now,
      },
    );

    const updatedActivityDay = await ctx.db.get(
      "organizationUserActivityDays",
      existingActivityDay._id,
    );
    if (!updatedActivityDay) {
      throwAppError("USER_ACTIVITY_DAY_NOT_FOUND");
    }

    return updatedActivityDay;
  }

  const activityDayId = await ctx.db.insert("organizationUserActivityDays", {
    organizationId: args.organizationId,
    userId: args.userId,
    activityDate,
    activityCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const activityDay = await ctx.db.get(
    "organizationUserActivityDays",
    activityDayId,
  );
  if (!activityDay) {
    throwAppError("USER_ACTIVITY_DAY_NOT_FOUND");
  }

  return activityDay;
}

export async function getOrganizationPersonActivityDay(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    activityDate: string;
  },
) {
  return await ctx.db
    .query("organizationPersonActivityDays")
    .withIndex(
      "by_organization_id_and_organization_person_id_and_activity_date",
      (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("organizationPersonId", args.organizationPersonId)
          .eq("activityDate", args.activityDate),
    )
    .unique();
}

async function normalizeLegacyUtcOrganizationPersonActivityDay(
  ctx: MutationCtx,
  args: {
    activityDate: string;
    now: number;
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    timeZone: string | undefined;
  },
) {
  const utcActivityDate = getUtcActivityDate(args.now);

  if (utcActivityDate === args.activityDate) {
    return;
  }

  const legacyActivityDay = await getOrganizationPersonActivityDay(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    activityDate: utcActivityDate,
  });
  if (
    !legacyActivityDay ||
    getActivityDate(legacyActivityDay.lastSeenAt, args.timeZone) !==
      args.activityDate
  ) {
    return;
  }

  const localActivityDay = await getOrganizationPersonActivityDay(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    activityDate: args.activityDate,
  });

  if (localActivityDay) {
    await ctx.db.patch("organizationPersonActivityDays", localActivityDay._id, {
      activityCount:
        localActivityDay.activityCount + legacyActivityDay.activityCount,
      firstSeenAt: Math.min(
        localActivityDay.firstSeenAt,
        legacyActivityDay.firstSeenAt,
      ),
      lastSeenAt: Math.max(
        localActivityDay.lastSeenAt,
        legacyActivityDay.lastSeenAt,
      ),
      updatedAt: args.now,
    });
    await ctx.db.delete(
      "organizationPersonActivityDays",
      legacyActivityDay._id,
    );
    return;
  }

  await ctx.db.patch("organizationPersonActivityDays", legacyActivityDay._id, {
    activityDate: args.activityDate,
    updatedAt: args.now,
  });
}

export async function recordOrganizationPersonActivity(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    timeZone?: string;
    timestamp?: number;
  },
) {
  const now = args.timestamp ?? Date.now();
  const activityDate = getActivityDate(now, args.timeZone);
  await normalizeLegacyUtcOrganizationPersonActivityDay(ctx, {
    activityDate,
    now,
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    timeZone: args.timeZone,
  });
  const existingActivityDay = await getOrganizationPersonActivityDay(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    activityDate,
  });

  if (existingActivityDay) {
    if (now - existingActivityDay.lastSeenAt < ACTIVITY_WRITE_THROTTLE_MS) {
      return existingActivityDay;
    }

    await ctx.db.patch(
      "organizationPersonActivityDays",
      existingActivityDay._id,
      {
        activityCount: existingActivityDay.activityCount + 1,
        lastSeenAt: now,
        updatedAt: now,
      },
    );

    const updatedActivityDay = await ctx.db.get(
      "organizationPersonActivityDays",
      existingActivityDay._id,
    );
    if (!updatedActivityDay) {
      throwAppError("PERSON_ACTIVITY_DAY_NOT_FOUND");
    }

    return updatedActivityDay;
  }

  const activityDayId = await ctx.db.insert("organizationPersonActivityDays", {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    activityDate,
    activityCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const activityDay = await ctx.db.get(
    "organizationPersonActivityDays",
    activityDayId,
  );
  if (!activityDay) {
    throwAppError("PERSON_ACTIVITY_DAY_NOT_FOUND");
  }

  return activityDay;
}

export async function listOrganizationUserActivityDaysForYear(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    year: number;
  },
) {
  const { startDate, endDate } = getYearActivityDateRange(args.year);

  return await ctx.db
    .query("organizationUserActivityDays")
    .withIndex("by_organization_id_and_user_id_and_activity_date", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("userId", args.userId)
        .gte("activityDate", startDate)
        .lte("activityDate", endDate),
    )
    .take(MAX_DAYS_PER_YEAR);
}

export async function listOrganizationPersonActivityDaysForYear(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    year: number;
  },
) {
  const { startDate, endDate } = getYearActivityDateRange(args.year);

  return await ctx.db
    .query("organizationPersonActivityDays")
    .withIndex(
      "by_organization_id_and_organization_person_id_and_activity_date",
      (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("organizationPersonId", args.organizationPersonId)
          .gte("activityDate", startDate)
          .lte("activityDate", endDate),
    )
    .take(MAX_DAYS_PER_YEAR);
}

export async function getLatestOrganizationUserActivityDay(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  },
) {
  const latestActivityDays = await ctx.db
    .query("organizationUserActivityDays")
    .withIndex("by_organization_id_and_user_id_and_activity_date", (query) =>
      query.eq("organizationId", args.organizationId).eq("userId", args.userId),
    )
    .order("desc")
    .take(1);

  return latestActivityDays[0] ?? null;
}

export async function getLatestOrganizationPersonActivityDay(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  const latestActivityDays = await ctx.db
    .query("organizationPersonActivityDays")
    .withIndex(
      "by_organization_id_and_organization_person_id_and_activity_date",
      (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("organizationPersonId", args.organizationPersonId),
    )
    .order("desc")
    .take(1);

  return latestActivityDays[0] ?? null;
}

export async function deleteOrganizationPersonActivityDayBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const activityDays = await ctx.db
    .query("organizationPersonActivityDays")
    .withIndex(
      "by_organization_id_and_organization_person_id_and_activity_date",
      (query) => query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const activityDay of activityDays) {
    await ctx.db.delete("organizationPersonActivityDays", activityDay._id);
  }

  return activityDays.length;
}

export async function deleteOrganizationUserActivityDayBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const activityDays = await ctx.db
    .query("organizationUserActivityDays")
    .withIndex("by_organization_id_and_user_id_and_activity_date", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const activityDay of activityDays) {
    await ctx.db.delete("organizationUserActivityDays", activityDay._id);
  }

  return activityDays.length;
}
