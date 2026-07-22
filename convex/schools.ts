import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUserOrThrow } from "./users";
import { canAccessSchool, hasOrgRole, hasSystemRole } from "./permissions";
import { isValidTimeZone } from "../lib/time-zone";
import { DEFAULT_INSTITUTION_GRADES } from "../lib/grades";
import type { Doc } from "./_generated/dataModel";

const schoolValidator = v.object({
  _id: v.id("schools"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  logoStorageId: v.optional(v.id("_storage")),
  timeZone: v.optional(v.string()),
  scheduleStartMinutes: v.optional(v.number()),
  scheduleEndMinutes: v.optional(v.number()),
  isActive: v.boolean(),
  createdAt: v.number(),
  createdBy: v.id("users"),
});

function normalizeSchoolName(value: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 100) {
    throw new ConvexError({
      code: "INVALID_NAME",
      message: "Institution name must contain between 2 and 100 characters.",
    });
  }
  return name;
}

function normalizeSchoolSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ConvexError({
      code: "INVALID_SLUG",
      message: "Institution URL identifier must use lowercase letters, numbers, and single hyphens.",
    });
  }
  return slug;
}

export const list = query({
  args: { isActive: v.optional(v.boolean()) },
  returns: v.array(schoolValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    let schools;
    if (args.isActive !== undefined) {
      schools = await ctx.db
        .query("schools")
        .withIndex("by_active", (q) => q.eq("isActive", args.isActive!))
        .order("desc")
        .collect();
    } else {
      schools = await ctx.db.query("schools").order("desc").collect();
    }

    const access = await Promise.all(
      schools.map((school) => canAccessSchool(ctx, user._id, school._id)),
    );
    return schools.filter((_, index) => access[index]);
  },
});

export const get = query({
  args: { id: v.id("schools") },
  returns: v.union(schoolValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const school = await ctx.db.get(args.id);
    if (!school) return null;
    if (!(await canAccessSchool(ctx, user._id, school._id))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    return school;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    timeZone: v.string(),
  },
  returns: v.id("schools"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    
    // Only Superadmins create schools
    if (!(await hasSystemRole(ctx, user._id, ["superadmin"]))) {
      throw new Error("Only superadmins can create schools.");
    }

    const name = normalizeSchoolName(args.name);
    const slug = normalizeSchoolSlug(args.slug);
    const existing = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    
    if (existing) throw new Error("A school with this slug already exists.");
    if (!isValidTimeZone(args.timeZone)) {
      throw new ConvexError("INVALID_TIME_ZONE");
    }

    const schoolId = await ctx.db.insert("schools", {
      name,
      slug,
      logoStorageId: args.logoStorageId,
      timeZone: args.timeZone,
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
    await Promise.all(
      DEFAULT_INSTITUTION_GRADES.map((grade, order) =>
        ctx.db.insert("institutionGrades", {
          schoolId,
          ...grade,
          order,
          createdAt: Date.now(),
          createdBy: user._id,
        }),
      ),
    );
    return schoolId;
  },
});

export const update = mutation({
  args: {
    id: v.id("schools"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    timeZone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await hasSystemRole(ctx, user._id, ["superadmin"]))) {
      throw new Error("Only superadmins can modify schools.");
    }

    const school = await ctx.db.get(args.id);
    if (!school) throw new Error("School not found");
    const name =
      args.name === undefined ? undefined : normalizeSchoolName(args.name);
    const slug =
      args.slug === undefined ? undefined : normalizeSchoolSlug(args.slug);
    if (args.timeZone !== undefined && !isValidTimeZone(args.timeZone)) {
      throw new ConvexError("INVALID_TIME_ZONE");
    }

    if (slug && slug !== school.slug) {
      const existing = await ctx.db
        .query("schools")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (existing && existing._id !== school._id) {
        throw new ConvexError("SLUG_IN_USE");
      }
    }

    const { id, logoStorageId } = args;
    const cleanUpdates: Partial<Doc<"schools">> = {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
      ...(args.timeZone !== undefined ? { timeZone: args.timeZone } : {}),
      ...(logoStorageId !== undefined
        ? { logoStorageId: logoStorageId ?? undefined }
        : {}),
    };

    await ctx.db.patch(id, cleanUpdates);

    // When the slug changes, all users' Clerk metadata must be rebuilt with the new key
    if (slug && slug !== school.slug) {
      await ctx.scheduler.runAfter(0, internal.roleAssignments.syncOrgUsersToClerk, {
        orgId: id,
        orgType: "school",
      });
    }
    return null;
  },
});

export const updateInstitutionSettings = mutation({
  args: {
    id: v.id("schools"),
    name: v.string(),
    timeZone: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const school = await ctx.db.get(args.id);
    if (!school) {
      throw new ConvexError({ code: "NOT_FOUND", message: "School not found" });
    }

    const canManage =
      (await hasSystemRole(ctx, user._id, ["superadmin"])) ||
      (await hasOrgRole(ctx, user._id, school._id, "school", ["admin"]));

    if (!canManage) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only institution administrators can update these settings.",
      });
    }

    const name = normalizeSchoolName(args.name);
    if (!isValidTimeZone(args.timeZone)) {
      throw new ConvexError("INVALID_TIME_ZONE");
    }

    if (name !== school.name || args.timeZone !== school.timeZone) {
      await ctx.db.patch(args.id, { name, timeZone: args.timeZone });
    }

    return null;
  },
});
