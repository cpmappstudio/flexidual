import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  canAccessSchool,
  canManageInstitution,
  canViewCampusOperations,
  canViewInstitutionSettings,
} from "./permissions";
import { getCurrentUserOrThrow } from "./users";
import { rescheduleAbekaForSchool } from "./model/abekaScheduling";
import {
  getCourseGradingPolicy,
  gradingPolicyValidator,
} from "./model/grading";
import { DEFAULT_GRADING_POLICY, isValidGradingPolicy } from "../lib/grading";
import { isCourseTeacher } from "./model/courseAssignments";
import { canAccessClass, canManageClass } from "./permissions";
import {
  getCourseGradingWeights,
  gradingWeightsUpdate,
  gradingWeightsValidator,
} from "./model/gradingWeights";
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
      institutionTimeZone: v.union(v.string(), v.null()),
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

    const canRead = campus
      ? await canViewCampusOperations(ctx, user._id, campus._id, args.schoolId)
      : await canViewInstitutionSettings(ctx, user._id, args.schoolId);
    if (!canRead) {
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
      institutionTimeZone: school.timeZone ?? null,
    };
  },
});

export const getGradingPolicy = query({
  args: { schoolId: v.id("schools") },
  returns: v.union(gradingPolicyValidator, v.null()),
  handler: async (ctx, { schoolId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await canViewInstitutionSettings(ctx, user._id, schoolId)))
      throw new ConvexError("PERMISSION_DENIED");
    const school = await ctx.db.get("schools", schoolId);
    return school ? (school.gradingPolicy ?? DEFAULT_GRADING_POLICY) : null;
  },
});

export const getGradingForCourse = query({
  args: { classId: v.id("classes") },
  returns: gradingPolicyValidator,
  handler: async (ctx, { classId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const course = await ctx.db.get("classes", classId);
    if (!course) throw new ConvexError("CLASS_NOT_FOUND");
    if (
      !isCourseTeacher(course, user._id) &&
      !(await canManageClass(ctx, user._id, course))
    )
      throw new ConvexError("PERMISSION_DENIED");
    return await getCourseGradingPolicy(ctx, course);
  },
});

export const updateGradingPolicy = mutation({
  args: { schoolId: v.id("schools"), policy: gradingPolicyValidator },
  returns: v.null(),
  handler: async (ctx, { schoolId, policy }) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await canManageInstitution(ctx, user._id, schoolId)))
      throw new ConvexError("PERMISSION_DENIED");
    const school = await ctx.db.get("schools", schoolId);
    if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");
    if (!isValidGradingPolicy(policy))
      throw new ConvexError("INVALID_GRADING_POLICY");
    const current = school.gradingPolicy;
    if (
      current?.scaleMax !== policy.scaleMax ||
      current.decimalPlaces !== policy.decimalPlaces ||
      current.defaultMaxPoints !== policy.defaultMaxPoints ||
      current.passingPercentage !== policy.passingPercentage
    )
      await ctx.db.patch("schools", schoolId, { gradingPolicy: policy });
    return null;
  },
});

export const getGradingWeights = query({
  args: { schoolId: v.id("schools") },
  returns: v.union(
    v.object({
      weights: v.union(gradingWeightsValidator, v.null()),
      version: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { schoolId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await canViewInstitutionSettings(ctx, user._id, schoolId)))
      throw new ConvexError("PERMISSION_DENIED");
    const school = await ctx.db.get("schools", schoolId);
    return school
      ? {
          weights: school.gradingWeights ?? null,
          version: school.gradingWeightsVersion ?? 0,
        }
      : null;
  },
});

export const getGradingWeightsForCourse = query({
  args: { classId: v.id("classes") },
  returns: v.object({
    weights: v.union(gradingWeightsValidator, v.null()),
    institutionalWeights: v.union(gradingWeightsValidator, v.null()),
    overridden: v.boolean(),
    version: v.number(),
  }),
  handler: async (ctx, { classId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const course = await ctx.db.get("classes", classId);
    if (!course) throw new ConvexError("CLASS_NOT_FOUND");
    if (!(await canAccessClass(ctx, user._id, course)))
      throw new ConvexError("PERMISSION_DENIED");
    return await getCourseGradingWeights(ctx, course);
  },
});

export const updateGradingWeights = mutation({
  args: {
    schoolId: v.id("schools"),
    weights: gradingWeightsValidator,
    expectedVersion: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { schoolId, weights, expectedVersion }) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await canManageInstitution(ctx, user._id, schoolId)))
      throw new ConvexError("PERMISSION_DENIED");
    const school = await ctx.db.get("schools", schoolId);
    if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");
    const changes = gradingWeightsUpdate(school, weights, expectedVersion);
    if (Object.keys(changes).length)
      await ctx.db.patch("schools", schoolId, changes);
    return changes.gradingWeightsVersion ?? school.gradingWeightsVersion ?? 0;
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

    const periodId = await ctx.db.insert("academicPeriods", {
      schoolId: args.schoolId,
      name,
      startDate: args.startDate,
      endDate: args.endDate,
      createdAt: Date.now(),
      createdBy: user._id,
    });
    await rescheduleAbekaForSchool(ctx, args.schoolId);
    return periodId;
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
    if (datesChanged) await rescheduleAbekaForSchool(ctx, period.schoolId);
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
    await rescheduleAbekaForSchool(ctx, period.schoolId);
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
      scopeType: v.union(v.literal("institution"), v.literal("campus")),
      institutionTimeZone: v.optional(v.string()),
      campusTimeZone: v.optional(v.string()),
      schedulingTimeZone: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const school = await ctx.db.get(args.schoolId);
    if (!school) return null;
    if (!(await canAccessSchool(ctx, user._id, school._id))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    const campus = args.campusId ? await ctx.db.get(args.campusId) : null;
    if (args.campusId) {
      if (!campus || campus.schoolId !== school._id) {
        throw new ConvexError("INVALID_CAMPUS");
      }
    }
    return {
      startMinutes:
        school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES,
      endMinutes: school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES,
      scopeType: campus ? ("campus" as const) : ("institution" as const),
      institutionTimeZone: school.timeZone,
      campusTimeZone: campus?.timeZone,
      schedulingTimeZone: campus?.timeZone ?? school.timeZone,
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
