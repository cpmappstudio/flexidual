import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUserOrThrow } from "./users";
import {
  canAccessCampus,
  canAccessSchool,
  canViewInstitutionSettings,
  hasOrgRole,
} from "./permissions";
import type { Id } from "./_generated/dataModel";
import { isValidTimeZone } from "../lib/time-zone";
import {
  clearCampusPrincipalAssignments,
  upsertRoleAssignment,
} from "./roleAssignments";

const campusValidator = v.object({
  _id: v.id("campuses"),
  _creationTime: v.number(),
  schoolId: v.id("schools"),
  name: v.string(),
  slug: v.string(),
  code: v.optional(v.string()),
  timeZone: v.optional(v.string()),
  address: v.optional(
    v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zipCode: v.optional(v.string()),
      country: v.optional(v.string()),
    }),
  ),
  isActive: v.boolean(),
  createdAt: v.number(),
  createdBy: v.id("users"),
});

const principalValidator = v.object({
  _id: v.id("users"),
  fullName: v.string(),
  email: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
});

const campusWithPrincipalValidator = v.object({
  ...campusValidator.fields,
  principal: v.union(principalValidator, v.null()),
});

function normalizeCampusName(value: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 100) {
    throw new ConvexError({
      code: "INVALID_NAME",
      message: "Campus name must contain between 2 and 100 characters.",
    });
  }
  return name;
}

function normalizeCampusSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ConvexError({
      code: "INVALID_SLUG",
      message: "Campus URL identifier must use lowercase letters, numbers, and single hyphens.",
    });
  }
  return slug;
}

function normalizeCampusCode(value?: string | null) {
  const code = value?.trim().toUpperCase();
  if (code && code.length > 30) {
    throw new ConvexError({
      code: "INVALID_CODE",
      message: "Campus code must contain at most 30 characters.",
    });
  }
  return code || undefined;
}

async function assertCanManageSchool(
  ctx: QueryCtx,
  userId: Id<"users">,
  schoolId: Id<"schools">,
) {
  if (!(await hasOrgRole(ctx, userId, schoolId, "school", ["admin"]))) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Only institution administrators can manage campuses.",
    });
  }
}

async function setCampusPrincipal(
  ctx: MutationCtx,
  campusId: Id<"campuses">,
  schoolId: Id<"schools">,
  principalId: Id<"users"> | null,
  assignedBy: Id<"users">,
) {
  if (!principalId) {
    await clearCampusPrincipalAssignments(ctx, campusId, assignedBy);
    return;
  }

  const [principal, assignments] = await Promise.all([
    ctx.db.get(principalId),
    ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", principalId))
      .collect(),
  ]);
  const isPrincipalInInstitution = assignments.some(
    (assignment) =>
      assignment.role === "principal" && assignment.schoolId === schoolId,
  );
  if (!principal?.isActive || !isPrincipalInInstitution) {
    throw new ConvexError({
      code: "INVALID_PRINCIPAL",
      message: "The selected principal does not belong to this institution.",
    });
  }

  await upsertRoleAssignment(
    ctx,
    {
      userId: principalId,
      orgType: "campus",
      orgId: campusId,
      role: "principal",
    },
    assignedBy,
  );
}

export const list = query({
  args: {
    schoolId: v.optional(v.id("schools")),
    isActive: v.optional(v.boolean()),
  },
  returns: v.array(campusValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    let campuses;
    if (args.schoolId) {
      if (!(await canAccessSchool(ctx, user._id, args.schoolId))) {
        throw new ConvexError("PERMISSION_DENIED");
      }
      if (args.isActive !== undefined) {
        campuses = await ctx.db
          .query("campuses")
          .withIndex("by_school", (q) =>
            q.eq("schoolId", args.schoolId!).eq("isActive", args.isActive!),
          )
          .order("desc")
          .collect();
      } else {
        campuses = await ctx.db
          .query("campuses")
          .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId!))
          .order("desc")
          .collect();
      }
    } else if (args.isActive !== undefined) {
      campuses = await ctx.db
        .query("campuses")
        .withIndex("by_active", (q) => q.eq("isActive", args.isActive!))
        .order("desc")
        .collect();
    } else {
      campuses = await ctx.db.query("campuses").order("desc").collect();
    }

    const access = await Promise.all(
      campuses.map((campus) =>
        canAccessCampus(ctx, user._id, campus._id, campus.schoolId),
      ),
    );
    return campuses.filter((_, index) => access[index]);
  },
});

export const get = query({
  args: { id: v.id("campuses") },
  returns: v.union(campusValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const campus = await ctx.db.get(args.id);
    if (!campus) return null;
    if (
      !(await canAccessCampus(ctx, user._id, campus._id, campus.schoolId))
    ) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    return campus;
  },
});

export const listForInstitutionSettings = query({
  args: { schoolId: v.id("schools") },
  returns: v.array(campusWithPrincipalValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await canViewInstitutionSettings(ctx, user._id, args.schoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const [campuses, assignments] = await Promise.all([
      ctx.db
        .query("campuses")
        .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId))
        .collect(),
      ctx.db
        .query("roleAssignments")
        .withIndex("by_school_role_grade", (q) =>
          q.eq("schoolId", args.schoolId).eq("role", "principal"),
        )
        .collect(),
    ]);
    const principalByCampus = new Map(
      assignments
        .filter((assignment) => assignment.orgType === "campus" && assignment.orgId)
        .map((assignment) => [assignment.orgId!, assignment.userId]),
    );
    const principals = new Map(
      (
        await Promise.all(
          [...new Set(principalByCampus.values())].map((id) => ctx.db.get(id)),
        )
      )
        .filter((principal) => principal?.isActive)
        .map((principal) => [principal!._id, principal!]),
    );

    return campuses
      .map((campus) => {
        const principal = principals.get(principalByCampus.get(campus._id)!);
        return {
          ...campus,
          principal: principal
            ? {
                _id: principal._id,
                fullName: principal.fullName,
                email: principal.email,
                imageUrl: principal.imageUrl,
              }
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listPrincipalCandidates = query({
  args: { schoolId: v.id("schools") },
  returns: v.array(principalValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertCanManageSchool(ctx, user._id, args.schoolId);
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_school_role_grade", (q) =>
        q.eq("schoolId", args.schoolId).eq("role", "principal"),
      )
      .collect();
    const principals = (
      await Promise.all(
        [...new Set(assignments.map((item) => item.userId))].map((id) =>
          ctx.db.get(id),
        ),
      )
    ).filter((principal) => principal?.isActive);

    return principals
      .map((principal) => ({
        _id: principal!._id,
        fullName: principal!.fullName,
        email: principal!.email,
        imageUrl: principal!.imageUrl,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    slug: v.string(),
    code: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    principalId: v.optional(v.id("users")),
  },
  returns: v.id("campuses"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertCanManageSchool(ctx, user._id, args.schoolId);

    const school = await ctx.db.get(args.schoolId);
    if (!school) {
      throw new ConvexError({
        code: "INSTITUTION_NOT_FOUND",
        message: "Institution not found.",
      });
    }
    if (!school.isActive) {
      throw new ConvexError({
        code: "INSTITUTION_INACTIVE",
        message: "Campuses cannot be added to an inactive institution.",
      });
    }

    const name = normalizeCampusName(args.name);
    const slug = normalizeCampusSlug(args.slug);
    const code = normalizeCampusCode(args.code);
    if (args.timeZone !== undefined && !isValidTimeZone(args.timeZone)) {
      throw new ConvexError("INVALID_TIME_ZONE");
    }

    const existing = await ctx.db
      .query("campuses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (existing) {
      throw new ConvexError({
        code: "SLUG_IN_USE",
        message: "A campus with this URL identifier already exists.",
      });
    }

    const campusId = await ctx.db.insert("campuses", {
      schoolId: args.schoolId,
      name,
      slug,
      code,
      timeZone: args.timeZone,
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
    if (args.principalId) {
      await setCampusPrincipal(
        ctx,
        campusId,
        args.schoolId,
        args.principalId,
        user._id,
      );
    }
    return campusId;
  },
});

export const update = mutation({
  args: {
    id: v.id("campuses"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    code: v.optional(v.union(v.string(), v.null())),
    timeZone: v.optional(v.union(v.string(), v.null())),
    isActive: v.optional(v.boolean()),
    principalId: v.optional(v.union(v.id("users"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const campus = await ctx.db.get(args.id);
    if (!campus) throw new Error("Campus not found");

    await assertCanManageSchool(ctx, user._id, campus.schoolId);
    const name =
      args.name === undefined ? undefined : normalizeCampusName(args.name);
    const slug =
      args.slug === undefined ? undefined : normalizeCampusSlug(args.slug);
    const code =
      args.code === undefined ? undefined : normalizeCampusCode(args.code);
    if (
      args.timeZone !== undefined &&
      args.timeZone !== null &&
      !isValidTimeZone(args.timeZone)
    ) {
      throw new ConvexError("INVALID_TIME_ZONE");
    }

    if (slug && slug !== campus.slug) {
      const existing = await ctx.db
        .query("campuses")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (existing && existing._id !== campus._id) {
        throw new ConvexError({
          code: "SLUG_IN_USE",
          message: "A campus with this URL identifier already exists.",
        });
      }
    }

    const { id, timeZone } = args;
    await ctx.db.patch(id, {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(args.code !== undefined ? { code } : {}),
      ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
      ...(timeZone !== undefined
        ? { timeZone: timeZone ?? undefined }
        : {}),
    });

    if (args.principalId !== undefined) {
      await setCampusPrincipal(
        ctx,
        id,
        campus.schoolId,
        args.principalId,
        user._id,
      );
    }

    // When the slug changes, all users' Clerk metadata must be rebuilt with the new key
    if (slug && slug !== campus.slug) {
      await ctx.scheduler.runAfter(
        0,
        internal.roleAssignments.syncOrgUsersToClerk,
        {
          orgId: id,
          orgType: "campus",
        },
      );
    }

    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("campuses") },
  returns: v.union(
    v.object({ deleted: v.literal(true) }),
    v.object({
      deleted: v.literal(false),
      reason: v.literal("CAMPUS_IN_USE"),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const campus = await ctx.db.get(args.id);
    if (!campus) return { deleted: true } as const;

    await assertCanManageSchool(ctx, user._id, campus.schoolId);

    const [linkedClass, linkedRole] = await Promise.all([
      ctx.db
        .query("classes")
        .withIndex("by_campus", (q) => q.eq("campusId", campus._id))
        .first(),
      ctx.db
        .query("roleAssignments")
        .withIndex("by_org", (q) =>
          q.eq("orgId", campus._id).eq("orgType", "campus"),
        )
        .first(),
    ]);

    if (linkedClass || linkedRole) {
      return { deleted: false, reason: "CAMPUS_IN_USE" } as const;
    }

    await ctx.db.delete(args.id);
    return { deleted: true } as const;
  },
});
