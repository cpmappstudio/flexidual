import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { canAccessEvent } from "./model/eventAccess";
import { pageEventAudienceAssignments } from "./model/eventChatAudience";
import { createSystemNotification } from "./model/systemNotifications";

const BATCH_SIZE = 25;
const noticeKind = v.union(
  v.literal("event_schedule"),
  v.literal("event_deleted"),
);

export async function scheduleEventNotice(
  ctx: MutationCtx,
  event: Doc<"events">,
  actorId: Id<"users">,
  kind: "event_schedule" | "event_deleted",
  action: "changed" | "removed",
  reason?: string,
) {
  await ctx.scheduler.runAfter(0, internal.eventChangeNotifications.publish, {
    eventId: event._id,
    schoolId: event.schoolId,
    campusId: event.campusId,
    gradeCodes: event.gradeCodes,
    title: event.title,
    actorId,
    kind,
    action,
    reason,
    noticeAt: Date.now(),
    sourceIndex: 0,
    cursor: null,
  });
}

export const publish = internalMutation({
  args: {
    eventId: v.id("events"),
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
    gradeCodes: v.optional(v.array(v.string())),
    title: v.string(),
    actorId: v.id("users"),
    kind: noticeKind,
    action: v.union(v.literal("changed"), v.literal("removed")),
    reason: v.optional(v.string()),
    noticeAt: v.number(),
    sourceIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.eventId);
    if (args.kind === "event_schedule" && !current) return null;
    const scope = args.kind === "event_schedule" ? current! : args;
    const page = await pageEventAudienceAssignments(
      ctx,
      scope,
      { sourceIndex: args.sourceIndex, cursor: args.cursor },
      BATCH_SIZE,
    );
    const [school, campus] = await Promise.all([
      ctx.db.get(args.schoolId),
      scope.campusId ? ctx.db.get(scope.campusId) : null,
    ]);
    for (const assignment of page.rows) {
      if (
        assignment.userId === args.actorId ||
        !(await canAccessEvent(ctx, assignment.userId, scope))
      )
        continue;
      await createSystemNotification(ctx, {
        recipientId: assignment.userId,
        kind: args.kind,
        action: args.action,
        actorId: args.actorId,
        eventId: args.eventId,
        eventTitle: args.title,
        schoolId: args.schoolId,
        campusId: scope.campusId,
        schoolName: school?.name,
        campusName: campus?.name,
        organizationSlug: campus?.slug ?? school?.slug,
        reason: args.reason,
        dedupeKey: `${args.kind}:${args.eventId}:${args.noticeAt}:${assignment.userId}`,
        createdAt: args.noticeAt,
      });
    }
    if (page.next)
      await ctx.scheduler.runAfter(
        0,
        internal.eventChangeNotifications.publish,
        {
          ...args,
          sourceIndex: page.next.sourceIndex,
          cursor: page.next.cursor,
        },
      );
    return null;
  },
});
