import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type SessionType = "live" | "ignitia" | "abeka";

export function deriveClassType(sessionTypes: (SessionType | undefined)[]) {
  if (sessionTypes.some((type) => (type ?? "live") === "live")) {
    return "standard" as const;
  }
  if (
    sessionTypes.length > 0 &&
    sessionTypes.every((type) => type === "ignitia")
  ) {
    return "ignitia" as const;
  }
  if (
    sessionTypes.length > 0 &&
    sessionTypes.every((type) => type === "abeka")
  ) {
    return "abeka" as const;
  }
  return undefined;
}

export async function classHasLiveSessions(
  ctx: QueryCtx,
  classId: Id<"classes">,
) {
  const [live, legacyLive] = await Promise.all([
    ctx.db
      .query("classSchedule")
      .withIndex("by_class_and_session_type", (q) =>
        q.eq("classId", classId).eq("sessionType", "live"),
      )
      .first(),
    ctx.db
      .query("classSchedule")
      .withIndex("by_class_and_session_type", (q) =>
        q.eq("classId", classId).eq("sessionType", undefined),
      )
      .first(),
  ]);
  return Boolean(live ?? legacyLive);
}

export async function deriveClassTypeFromSchedules(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
) {
  const sessionTypes = ["live", undefined, "ignitia", "abeka"] as const;
  const schedules = await Promise.all(
    sessionTypes.map((sessionType) =>
      ctx.db
        .query("classSchedule")
        .withIndex("by_class_and_session_type", (q) =>
          q.eq("classId", classId).eq("sessionType", sessionType),
        )
        .first(),
    ),
  );
  return deriveClassType(
    schedules.flatMap((schedule) =>
      schedule ? [schedule.sessionType] : [],
    ),
  );
}

export async function syncClassTypeFromSchedules(
  ctx: MutationCtx,
  classId: Id<"classes">,
) {
  const [classData, classType] = await Promise.all([
    ctx.db.get(classId),
    deriveClassTypeFromSchedules(ctx, classId),
  ]);
  if (!classData) return;
  if (classData.classType !== classType) {
    await ctx.db.patch(classId, { classType });
  }
}
