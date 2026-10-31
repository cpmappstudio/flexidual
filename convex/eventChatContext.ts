import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import { getUserImageUrl } from "./model/userImage";
import { canAccessEvent, isEventStudent } from "./model/eventAccess";
import {
  getEventChatCapabilities,
  getEventChatMute,
} from "./model/eventChatAccess";
import { pageEventAudienceAssignments } from "./model/eventChatAudience";

const participantValidator = v.object({
  _id: v.id("users"),
  fullName: v.string(),
  imageUrl: v.optional(v.string()),
  role: v.union(
    v.literal("teacher"),
    v.literal("student"),
    v.literal("member"),
  ),
  isMuted: v.boolean(),
});

export const get = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.object({
      title: v.string(),
      timeZone: v.string(),
      canModerate: v.boolean(),
      canDisableChat: v.boolean(),
      chatSettings: v.object({
        studentsMuted: v.boolean(),
        disabled: v.boolean(),
        studentAttachmentsEnabled: v.boolean(),
        archived: v.boolean(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, { eventId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get("events", eventId);
    if (!event || !(await canAccessEvent(ctx, user._id, event))) return null;
    const capabilities = await getEventChatCapabilities(ctx, event, user._id);
    return {
      title: event.title,
      timeZone: event.timeZone,
      canModerate: capabilities.canModerate,
      canDisableChat: capabilities.canDisable,
      chatSettings: {
        studentsMuted: event.chatStudentsMuted ?? false,
        disabled: event.chatDisabled ?? false,
        studentAttachmentsEnabled: event.chatStudentAttachmentsEnabled ?? false,
        archived: event.chatArchivedAt !== undefined,
      },
    };
  },
});

export const listParticipants = query({
  args: { eventId: v.id("events"), cursor: v.optional(v.string()) },
  returns: v.object({
    page: v.array(participantValidator),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get("events", args.eventId);
    if (!event || !(await canAccessEvent(ctx, user._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    let position: { sourceIndex: number; cursor: string | null } = {
      sourceIndex: 0,
      cursor: null,
    };
    if (args.cursor) {
      try {
        const parsed: unknown = JSON.parse(args.cursor);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          !("sourceIndex" in parsed) ||
          !("cursor" in parsed) ||
          !Number.isSafeInteger(parsed.sourceIndex) ||
          (parsed.cursor !== null && typeof parsed.cursor !== "string")
        )
          throw new Error();
        position = parsed as typeof position;
      } catch {
        throw new ConvexError("INVALID_CURSOR");
      }
    }
    const result = await pageEventAudienceAssignments(ctx, event, position, 30);
    const page = await Promise.all(
      result.rows.map(async (assignment) => {
        if (
          !(await canAccessEvent(ctx, assignment.userId, event)) ||
          assignment.role === "tutor"
        )
          return null;
        const participant = await ctx.db.get("users", assignment.userId);
        if (!participant) return null;
        const isStudent = await isEventStudent(ctx, participant._id, event);
        return {
          _id: participant._id,
          fullName: participant.fullName,
          imageUrl: await getUserImageUrl(ctx, participant),
          role: isStudent
            ? ("student" as const)
            : participant._id === event.responsibleId ||
                event.teacherIds.includes(participant._id)
              ? ("teacher" as const)
              : ("member" as const),
          isMuted: Boolean(
            await getEventChatMute(ctx, event._id, participant._id),
          ),
        };
      }),
    );
    return {
      page: page.filter((item) => item !== null),
      nextCursor: result.next ? JSON.stringify(result.next) : null,
    };
  },
});

export const listOptions = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      eventId: v.id("events"),
      title: v.string(),
      archived: v.boolean(),
      canRestore: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const result = await ctx.db
      .query("eventChatThreads")
      .withIndex("by_schoolId_and_lastMessageAt", (q) =>
        q.eq("schoolId", args.schoolId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const thread of result.page) {
      const event = await ctx.db.get("events", thread.eventId);
      if (
        !event ||
        (args.campusId && event.campusId && event.campusId !== args.campusId) ||
        !(await canAccessEvent(ctx, user._id, event))
      )
        continue;
      page.push({
        eventId: event._id,
        title: event.title,
        archived: event.chatArchivedAt !== undefined,
        canRestore: (await getEventChatCapabilities(ctx, event, user._id))
          .canDisable,
      });
    }
    return { ...result, page };
  },
});
