import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  canAccessSchool,
  canManageClasses,
  canManageInstitution,
} from "./permissions";
import { getCurrentUserOrThrow } from "./users";
import {
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
  isValidScheduleWindow,
} from "../lib/academic-settings";
import {
  civilDayNumber,
  isValidCivilDate,
  toCivilDate,
} from "../lib/time-zone";

const MAX_PERIOD_DAYS = 400;

const periodValidator = v.object({
  _id: v.id("academicPeriods"),
  _creationTime: v.number(),
  schoolId: v.id("schools"),
  name: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  createdAt: v.number(),
  createdBy: v.id("users"),
});

function validatePeriod(name: string, startDate: string, endDate: string) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 100) {
    throw new ConvexError("INVALID_ACADEMIC_PERIOD_NAME");
  }
  if (!isValidCivilDate(startDate) || !isValidCivilDate(endDate)) {
    throw new ConvexError("INVALID_ACADEMIC_PERIOD");
  }
  const durationDays = civilDayNumber(endDate) - civilDayNumber(startDate);
  if (durationDays <= 0 || durationDays > MAX_PERIOD_DAYS) {
    throw new ConvexError("INVALID_ACADEMIC_PERIOD");
  }
  return normalizedName;
}

async function hasPeriodOverlap(
  ctx: QueryCtx | MutationCtx,
  schoolId: Id<"schools">,
  startDate: string,
  endDate: string,
  excludeId?: Id<"academicPeriods">,
) {
  const periods = await ctx.db
    .query("academicPeriods")
    .withIndex("by_school_and_start", (q) => q.eq("schoolId", schoolId))
    .collect();
  return periods.some(
    (period) =>
      period._id !== excludeId &&
      toCivilDate(period.startDate) <= endDate &&
      toCivilDate(period.endDate) >= startDate,
  );
}

export const get = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
  },
  returns: v.union(
    v.null(),
    v.object({
      periods: v.array(periodValidator),
      scheduleStartMinutes: v.number(),
      scheduleEndMinutes: v.number(),
      timeZone: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const school = await ctx.db.get(args.schoolId);
    if (!school) return null;

    const campus = args.campusId ? await ctx.db.get(args.campusId) : null;
    if (args.campusId) {
      if (!campus || campus.schoolId !== args.schoolId) {
        throw new ConvexError("INVALID_CAMPUS");
      }
    }

    if (
      !(await canManageClasses(ctx, user._id, args.campusId, args.schoolId))
    ) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const periods = (
      await ctx.db
        .query("academicPeriods")
        .withIndex("by_school_and_start", (q) =>
          q.eq("schoolId", args.schoolId),
        )
        .collect()
    )
      .map((period) => ({
        ...period,
        startDate: toCivilDate(period.startDate),
        endDate: toCivilDate(period.endDate),
      }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));

    return {
      periods,
      scheduleStartMinutes:
        school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES,
      scheduleEndMinutes:
        school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES,
      timeZone: campus?.timeZone ?? school.timeZone,
    };
  },
});

export const createPeriod = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.id("academicPeriods"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const school = await ctx.db.get(args.schoolId);
    if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");
    if (!(await canManageInstitution(ctx, user._id, args.schoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const name = validatePeriod(args.name, args.startDate, args.endDate);
    if (
      await hasPeriodOverlap(ctx, args.schoolId, args.startDate, args.endDate)
    ) {
      throw new ConvexError("ACADEMIC_PERIOD_OVERLAP");
    }

    return await ctx.db.insert("academicPeriods", {
      schoolId: args.schoolId,
      name,
      startDate: args.startDate,
      endDate: args.endDate,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

export const updatePeriod = mutation({
  args: {
    id: v.id("academicPeriods"),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const period = await ctx.db.get(args.id);
    if (!period) throw new ConvexError("ACADEMIC_PERIOD_NOT_FOUND");
    if (!(await canManageInstitution(ctx, user._id, period.schoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const name = validatePeriod(args.name, args.startDate, args.endDate);
    if (
      await hasPeriodOverlap(
        ctx,
        period.schoolId,
        args.startDate,
        args.endDate,
        period._id,
      )
    ) {
      throw new ConvexError("ACADEMIC_PERIOD_OVERLAP");
    }

    const datesChanged =
      toCivilDate(period.startDate) !== args.startDate ||
      toCivilDate(period.endDate) !== args.endDate;
    if (datesChanged) {
      const classUsingPeriod = await ctx.db
        .query("classes")
        .withIndex("by_academic_period", (q) =>
          q.eq("academicPeriodId", period._id),
        )
        .first();
      if (classUsingPeriod) throw new ConvexError("ACADEMIC_PERIOD_IN_USE");
    }

    await ctx.db.patch(period._id, {
      name,
      startDate: args.startDate,
      endDate: args.endDate,
    });
    return null;
  },
});

export const removePeriod = mutation({
  args: { id: v.id("academicPeriods") },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const period = await ctx.db.get(args.id);
    if (!period) return { deleted: true };
    if (!(await canManageInstitution(ctx, user._id, period.schoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const classUsingPeriod = await ctx.db
      .query("classes")
      .withIndex("by_academic_period", (q) =>
        q.eq("academicPeriodId", period._id),
      )
      .first();
    if (classUsingPeriod) return { deleted: false };

    await ctx.db.delete(period._id);
    return { deleted: true };
  },
});

export const getScheduleWindow = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
  },
  returns: v.union(
    v.null(),
    v.object({
      startMinutes: v.number(),
      endMinutes: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const school = await ctx.db.get(args.schoolId);
    if (!school) return null;
    if (!(await canAccessSchool(ctx, user._id, school._id))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    if (args.campusId) {
      const campus = await ctx.db.get(args.campusId);
      if (!campus || campus.schoolId !== school._id) {
        throw new ConvexError("INVALID_CAMPUS");
      }
    }
    return {
      startMinutes:
        school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES,
      endMinutes: school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES,
    };
  },
});

export const updateScheduleWindow = mutation({
  args: {
    schoolId: v.id("schools"),
    startMinutes: v.number(),
    endMinutes: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const school = await ctx.db.get(args.schoolId);
    if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");
    if (!(await canManageInstitution(ctx, user._id, args.schoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    if (!isValidScheduleWindow(args.startMinutes, args.endMinutes)) {
      throw new ConvexError("INVALID_SCHEDULE_WINDOW");
    }

    await ctx.db.patch(args.schoolId, {
      scheduleStartMinutes: args.startMinutes,
      scheduleEndMinutes: args.endMinutes,
    });
    return null;
  },
});
