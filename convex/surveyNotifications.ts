import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { surveyCampaignValidator } from "./schema";
import { getCurrentUserOrThrow } from "./users";
import { createSystemNotification } from "./model/systemNotifications";
import { getSurveyStaffRole as staffRole } from "./model/surveyAccess";

export const SURVEY_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SURVEY_REMINDERS = 3;
const campaignDocument = v.object({
  ...surveyCampaignValidator.fields,
  _id: v.id("surveyCampaigns"),
  _creationTime: v.number(),
});

async function campaignFor(ctx: QueryCtx, surveyId: string) {
  return ctx.db
    .query("surveyCampaigns")
    .withIndex("by_survey_id", (q) => q.eq("surveyId", surveyId))
    .unique();
}

// Explicit activation only. No automatic campaign creation or production fan-out.
export const configure = internalMutation({
  args: {
    surveyId: v.string(),
    projectToken: v.string(),
    enabled: v.boolean(),
    origin: v.string(),
  },
  returns: v.id("surveyCampaigns"),
  handler: async (ctx, args) => {
    const origin = new URL(args.origin).origin;
    if (origin !== "http://localhost:3000")
      throw new Error("Only local survey testing is enabled");
    const existing = await campaignFor(ctx, args.surveyId);
    const fields = { ...args, origin, remoteActive: false };
    if (existing) {
      await ctx.db.patch("surveyCampaigns", existing._id, fields);
      return existing._id;
    }
    return ctx.db.insert("surveyCampaigns", fields);
  },
});

export const getState = query({
  args: { surveyId: v.string() },
  returns: v.object({ enabled: v.boolean(), completed: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const campaign = await campaignFor(ctx, args.surveyId);
    if (!campaign?.enabled) return { enabled: false, completed: false };
    const participation = await ctx.db
      .query("surveyParticipation")
      .withIndex("by_campaign_and_user", (q) =>
        q.eq("campaignId", campaign._id).eq("userId", user._id),
      )
      .unique();
    return {
      enabled: true,
      completed: participation?.completedAt !== undefined,
    };
  },
});

// Called only after SDK eligibility, or to sync a locally completed response.
// Completion is a user's acknowledgement, not proof of PostHog ingestion.
export const acknowledge = mutation({
  args: {
    surveyId: v.string(),
    organizationSlug: v.string(),
    completed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const campaign = await campaignFor(ctx, args.surveyId);
    if (!campaign?.enabled) return null;
    if (!(await staffRole(ctx, user._id, args.organizationSlug)))
      throw new Error("Survey access denied");
    const existing = await ctx.db
      .query("surveyParticipation")
      .withIndex("by_campaign_and_user", (q) =>
        q.eq("campaignId", campaign._id).eq("userId", user._id),
      )
      .unique();
    const now = Date.now();
    if (existing?.completedAt !== undefined) return null;
    if (existing) {
      if (args.completed) {
        await ctx.db.patch("surveyParticipation", existing._id, {
          completedAt: now,
          nextReminderAt: undefined,
        });
        if (existing.notificationId) {
          const notification = await ctx.db.get(
            "systemNotifications",
            existing.notificationId,
          );
          if (notification)
            await ctx.db.patch("systemNotifications", notification._id, {
              readAt: notification.readAt ?? now,
            });
        }
      }
    } else {
      await ctx.db.insert("surveyParticipation", {
        campaignId: campaign._id,
        userId: user._id,
        organizationSlug: args.organizationSlug,
        remindersSent: 0,
        ...(args.completed ? { completedAt: now } : { nextReminderAt: now }),
      });
      if (!args.completed)
        await ctx.scheduler.runAfter(
          0,
          internal.surveyNotifications.refreshCampaign,
          { campaignId: campaign._id },
        );
    }
    return null;
  },
});

export const campaignPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(campaignDocument),
  handler: async (ctx, args) =>
    ctx.db.query("surveyCampaigns").paginate(args.paginationOpts),
});

export const deliveryContext = internalQuery({
  args: { campaignId: v.id("surveyCampaigns"), now: v.number() },
  returns: v.object({
    campaign: v.union(campaignDocument, v.null()),
    recipients: v.array(
      v.object({
        participationId: v.id("surveyParticipation"),
        distinctId: v.string(),
        role: v.union(v.string(), v.null()),
        organizationSlug: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get("surveyCampaigns", args.campaignId);
    if (!campaign?.enabled) return { campaign: null, recipients: [] };
    const due = await ctx.db
      .query("surveyParticipation")
      .withIndex("by_campaign_and_next_reminder_at", (q) =>
        q
          .eq("campaignId", campaign._id)
          .gte("nextReminderAt", 0)
          .lte("nextReminderAt", args.now),
      )
      .take(25);
    const recipients = [];
    for (const participation of due) {
      const role = await staffRole(
        ctx,
        participation.userId,
        participation.organizationSlug,
      );
      const user = await ctx.db.get("users", participation.userId);
      recipients.push({
        participationId: participation._id,
        distinctId: user?.clerkId ?? "",
        role,
        organizationSlug: participation.organizationSlug,
      });
    }
    return { campaign, recipients };
  },
});

export const setRemoteActive = internalMutation({
  args: { campaignId: v.id("surveyCampaigns"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get("surveyCampaigns", args.campaignId);
    if (campaign && campaign.remoteActive !== args.active)
      await ctx.db.patch("surveyCampaigns", campaign._id, {
        remoteActive: args.active,
      });
    return null;
  },
});

export const deliver = internalMutation({
  args: { participationId: v.id("surveyParticipation") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(
      "surveyParticipation",
      args.participationId,
    );
    const now = Date.now();
    if (
      !participation ||
      participation.completedAt !== undefined ||
      participation.nextReminderAt === undefined ||
      participation.nextReminderAt > now
    )
      return null;
    const campaign = await ctx.db.get(
      "surveyCampaigns",
      participation.campaignId,
    );
    if (
      !campaign?.enabled ||
      !campaign.remoteActive ||
      !(await staffRole(
        ctx,
        participation.userId,
        participation.organizationSlug,
      ))
    )
      return null;
    if (
      participation.notificationId &&
      participation.remindersSent >= MAX_SURVEY_REMINDERS
    )
      return null;
    let notificationId = participation.notificationId;
    if (notificationId) {
      const notification = await ctx.db.get(
        "systemNotifications",
        notificationId,
      );
      if (!notification) return null;
      // Resurface the same row: never accumulate duplicate reminders.
      await ctx.db.patch("systemNotifications", notificationId, {
        readAt: undefined,
        createdAt: now,
      });
    } else {
      notificationId =
        (await createSystemNotification(ctx, {
          recipientId: participation.userId,
          kind: "survey_invitation",
          surveyId: campaign.surveyId,
          organizationSlug: participation.organizationSlug,
          dedupeKey: `survey:${campaign.surveyId}:${participation.userId}`,
        })) ?? undefined;
    }
    if (!notificationId) return null;
    const remindersSent =
      participation.remindersSent + (participation.notificationId ? 1 : 0);
    await ctx.db.patch("surveyParticipation", participation._id, {
      notificationId,
      remindersSent,
      deliveryAllowed: true,
      nextReminderAt:
        remindersSent < MAX_SURVEY_REMINDERS
          ? now + SURVEY_REMINDER_INTERVAL_MS
          : undefined,
    });
    return null;
  },
});

export const defer = internalMutation({
  args: { participationId: v.id("surveyParticipation") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(
      "surveyParticipation",
      args.participationId,
    );
    const now = Date.now();
    if (
      participation?.completedAt === undefined &&
      participation?.nextReminderAt !== undefined &&
      participation.nextReminderAt <= now
    ) {
      await ctx.db.patch("surveyParticipation", participation._id, {
        deliveryAllowed: false,
        nextReminderAt: now + 24 * 60 * 60 * 1000,
      });
    }
    return null;
  },
});

type RemoteSurvey = {
  id: string;
  start_date?: string;
  end_date?: string | null;
  linked_flag_key?: string;
  targeting_flag_key?: string;
  internal_targeting_flag_key?: string;
  conditions?: {
    url?: string;
    urlMatchType?: string;
    linkedFlagVariant?: string;
    events?: unknown;
    actions?: unknown;
    selector?: unknown;
    deviceTypes?: unknown[];
  };
};

export function matchesSurveyDestination(survey: RemoteSurvey, url: string) {
  const conditions = survey.conditions;
  if (
    conditions?.events ||
    conditions?.actions ||
    conditions?.selector ||
    conditions?.deviceTypes?.length
  )
    return false;
  if (!conditions?.url) return true;
  switch (conditions.urlMatchType ?? "icontains") {
    case "exact":
      return conditions.url === url;
    case "icontains":
      return url.toLowerCase().includes(conditions.url.toLowerCase());
    case "regex":
      try {
        return new RegExp(conditions.url).test(url);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

async function remoteSurvey(
  campaign: Doc<"surveyCampaigns">,
): Promise<RemoteSurvey | undefined> {
  const url = new URL("https://us.i.posthog.com/api/surveys/");
  url.searchParams.set("token", campaign.projectToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Survey configuration unavailable");
  const data = (await response.json()) as { surveys?: RemoteSurvey[] };
  if (!Array.isArray(data.surveys))
    throw new Error("Invalid survey configuration");
  return data.surveys.find((survey) => survey.id === campaign.surveyId);
}

async function matchesAudience(
  campaign: Doc<"surveyCampaigns">,
  survey: RemoteSurvey,
  distinctId: string,
  role: string,
) {
  // As in our repeatable SDK panel, completion is coordinated by Convex, not
  // PostHog's internal already-seen/iteration flag. Audience/linked flags still apply.
  const keys = [survey.linked_flag_key, survey.targeting_flag_key].filter(
    (key): key is string => Boolean(key),
  );
  if (!keys.length) return true;
  const response = await fetch("https://us.i.posthog.com/flags?v=2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      api_key: campaign.projectToken,
      distinct_id: distinctId,
      person_properties: { role },
      flag_keys_to_evaluate: keys,
    }),
  });
  if (!response.ok) return false;
  const data = (await response.json()) as {
    errorsWhileComputingFlags?: boolean;
    flags?: Record<string, { enabled?: boolean; variant?: string }>;
  };
  if (data.errorsWhileComputingFlags || !data.flags) return false;
  return keys.every(
    (key) =>
      data.flags?.[key]?.enabled === true &&
      (key !== survey.linked_flag_key ||
        !survey.conditions?.linkedFlagVariant ||
        data.flags[key].variant === survey.conditions.linkedFlagVariant),
  );
}

export const refreshCampaign = internalAction({
  args: { campaignId: v.id("surveyCampaigns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, recipients } = await ctx.runQuery(
      internal.surveyNotifications.deliveryContext,
      { ...args, now: Date.now() },
    );
    if (!campaign) return null;
    try {
      const survey = await remoteSurvey(campaign);
      const active = Boolean(
        survey?.start_date &&
          !survey.end_date &&
          Date.parse(survey.start_date) <= Date.now(),
      );
      await ctx.runMutation(internal.surveyNotifications.setRemoteActive, {
        ...args,
        active,
      });
      if (!active || !survey) return null;
      for (const recipient of recipients) {
        const destinationMatches = ["en", "es"].some((locale) =>
          matchesSurveyDestination(
            survey,
            `${campaign.origin}/${locale}/${recipient.organizationSlug}/catalog`,
          ),
        );
        if (
          recipient.role &&
          destinationMatches &&
          (await matchesAudience(
            campaign,
            survey,
            recipient.distinctId,
            recipient.role,
          ))
        ) {
          await ctx.runMutation(internal.surveyNotifications.deliver, {
            participationId: recipient.participationId,
          });
        } else {
          await ctx.runMutation(internal.surveyNotifications.defer, {
            participationId: recipient.participationId,
          });
        }
      }
    } catch {
      // Fail closed. Never send from an old configuration when PostHog is unavailable.
      console.warn(
        "Survey reminders deferred: PostHog configuration unavailable",
      );
    }
    return null;
  },
});

export const refresh = internalAction({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.runQuery(internal.surveyNotifications.campaignPage, {
      paginationOpts: { cursor: args.cursor ?? null, numItems: 10 },
    });
    for (const campaign of page.page) {
      if (campaign.enabled)
        await ctx.scheduler.runAfter(
          0,
          internal.surveyNotifications.refreshCampaign,
          { campaignId: campaign._id },
        );
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.surveyNotifications.refresh, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
