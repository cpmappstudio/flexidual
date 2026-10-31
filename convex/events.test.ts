import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { canAccessEvent } from "./model/eventAccess";
import {
  deleteCampusEvents,
  removeGradeFromEvents,
} from "./model/eventDeletion";
import { addCivilDays, localDateTimeToUtc } from "../lib/time-zone";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send() {
      return { Contents: [] };
    }
  },
  ListObjectsV2Command: class {},
  DeleteObjectCommand: class {},
}));

const SINGLE_START = Date.UTC(2030, 9, 23, 14);
const SINGLE_END = SINGLE_START + 60 * 60_000;

async function expectedFutureFingerprint(
  f: Awaited<ReturnType<typeof fixture>>,
  eventId: Id<"events">,
) {
  const { event, future } = await f.t.run(async (ctx) => ({
    event: (await ctx.db.get(eventId))!,
    future: await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_status_and_scheduledStart", (q) =>
        q
          .eq("eventId", eventId)
          .eq("status", "scheduled")
          .gte("scheduledStart", Date.now()),
      )
      .take(501),
  }));
  return JSON.stringify({
    timeZone: event.timeZone,
    campusId: event.campusId,
    weeklySlots: event.weeklySlots,
    recurrenceStartDate: event.recurrenceStartDate,
    recurrenceEndDate: event.recurrenceEndDate,
    dates: future.map(({ _id, scheduledStart, scheduledEnd }) => [
      _id,
      scheduledStart,
      scheduledEnd,
    ]),
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("only scoped administrators edit event details, and audience changes apply to history", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  await f.t.run((ctx) =>
    ctx.db.patch(f.otherCampusId, { timeZone: "America/New_York" }),
  );
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    gradeCodes: ["05"],
    title: "Flag ceremony",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const before = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .unique(),
  );
  const details = {
    eventId,
    campusId: f.otherCampusId,
    gradeCodes: ["05"],
    title: "Assembly",
    description: "Updated audience",
    responsibleId: f.otherTeacher,
    teacherIds: [] as (typeof f.teacher)[],
  };
  await expect(
    f.t
      .withIdentity({ subject: "teacher" })
      .mutation(api.events.updateDetails, details),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.t
      .withIdentity({ subject: "principal" })
      .mutation(api.events.updateDetails, details),
  ).rejects.toThrow("PERMISSION_DENIED");
  await admin.mutation(api.events.updateDetails, details);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = await f.t.run(async (ctx) => {
    const event = (await ctx.db.get(eventId))!;
    const occurrence = (await ctx.db.get(before!._id))!;
    return {
      event,
      occurrence,
      oldStudent: await canAccessEvent(ctx, f.student, event),
      newStudent: await canAccessEvent(ctx, f.otherStudent, event),
    };
  });
  expect(after.event).toMatchObject({
    title: "Assembly",
    description: "Updated audience",
    responsibleId: f.otherTeacher,
    timeZone: "America/New_York",
  });
  expect(after.occurrence).toMatchObject({
    campusId: f.otherCampusId,
    scheduledStart: before!.scheduledStart,
    scheduledEnd: before!.scheduledEnd,
  });
  expect([after.oldStudent, after.newStudent]).toEqual([false, true]);
});

test("changing an event's campus syncs all dates across scheduled batches", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    title: "Devotional",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: {
      kind: "weekly",
      startDate: "2030-01-01",
      endDate: "2030-10-07",
      slots: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startMinutes: 8 * 60,
        durationMinutes: 30,
      })),
    },
  });
  const dates = () =>
    f.t.run((ctx) =>
      ctx.db
        .query("eventOccurrences")
        .withIndex("by_eventId_and_scheduledStart", (q) =>
          q.eq("eventId", eventId),
        )
        .collect(),
    );
  const before = await dates();
  expect(before.length).toBeGreaterThan(100);

  await admin.mutation(api.events.updateDetails, {
    eventId,
    campusId: f.otherCampusId,
    title: "Devotional",
    responsibleId: f.otherTeacher,
    teacherIds: [],
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);

  const after = await dates();
  const schedule = (rows: typeof before) =>
    rows.map(({ _id, scheduledStart, scheduledEnd, status }) => ({
      _id,
      scheduledStart,
      scheduledEnd,
      status,
    }));
  expect(schedule(after)).toEqual(schedule(before));
  expect(after.every(({ campusId }) => campusId === f.otherCampusId)).toBe(
    true,
  );

  const calendarRange = {
    schoolId: f.schoolId,
    scope: "campus" as const,
    from: Date.UTC(2030, 0, 1),
    to: Date.UTC(2030, 0, 2),
    paginationOpts: { numItems: 10, cursor: null },
  };
  const oldCampus = await admin.query(api.events.listForCalendar, {
    ...calendarRange,
    campusId: f.campusId,
  });
  const newCampus = await admin.query(api.events.listForCalendar, {
    ...calendarRange,
    campusId: f.otherCampusId,
  });
  expect(oldCampus.page).toEqual([]);
  expect(newCampus.page.map(({ eventId }) => eventId)).toEqual([eventId]);
});

test("global schedule edit replaces every future date and preserves past sessions", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 3 * 86_400_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: {
      kind: "weekly",
      startDate: "2030-10-23",
      endDate: "2030-11-13",
      slots: [{ dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 60 }],
    },
  });
  const manuallyAdded = await f.t.run((ctx) =>
    ctx.db.insert("eventOccurrences", {
      eventId,
      schoolId: f.schoolId,
      scheduledStart: SINGLE_START + 2 * 86_400_000,
      scheduledEnd: SINGLE_END + 2 * 86_400_000,
      status: "scheduled",
      roomName: "legacy-extra-date",
      createdAt: Date.now(),
      createdBy: f.admin,
    }),
  );
  const before = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  vi.setSystemTime(SINGLE_END + 1);
  const preview = await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  });
  expect(preview?.futureCount).toBe(before.length - 1);
  const replacement = {
    kind: "weekly" as const,
    startDate: "2030-10-28",
    endDate: "2030-10-28",
    slots: [{ dayOfWeek: 1, startMinutes: 9 * 60, durationMinutes: 60 }],
  };
  const details = {
    eventId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    scheduleEdit: {
      mode: "replace" as const,
      schedule: replacement,
      reason: "New date",
      expectedFutureCount: preview!.futureCount,
      expectedFutureFingerprint: preview!.futureFingerprint,
    },
  };
  await expect(
    admin.mutation(api.events.updateDetails, {
      ...details,
      scheduleEdit: { ...details.scheduleEdit, expectedFutureCount: 1 },
    }),
  ).rejects.toThrow("EVENT_SCHEDULE_CHANGED");
  await expect(
    admin.mutation(api.events.updateDetails, {
      ...details,
      scheduleEdit: {
        ...details.scheduleEdit,
        schedule: {
          kind: "single",
          start: SINGLE_START + 5 * 86_400_000,
          end: SINGLE_END + 5 * 86_400_000,
        },
      },
    }),
  ).rejects.toThrow("EVENT_RECURRENCE_TYPE_CHANGE_NOT_ALLOWED");
  await admin.mutation(api.events.updateDetails, details);
  const after = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(after.find((row) => row._id === before[0]._id)).toMatchObject({
    status: "scheduled",
    scheduledStart: before[0].scheduledStart,
  });
  expect(after.find((row) => row._id === manuallyAdded)?.status).toBe(
    "cancelled",
  );
  expect(
    after
      .filter((row) => row.status === "scheduled")
      .map((row) => row.scheduledStart),
  ).toEqual([before[0].scheduledStart, SINGLE_START + 5 * 86_400_000]);
  expect(
    (await f.t.run((ctx) => ctx.db.get(eventId)))?.weeklySlots,
  ).toHaveLength(1);
});

test("expanding a weekly range keeps matching dates and previews only real changes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 30, 12));
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const details = {
    title: "Friday event",
    responsibleId: f.teacher,
    teacherIds: [],
  };
  const schedule = {
    kind: "weekly" as const,
    startDate: "2026-11-06",
    endDate: "2026-11-16",
    slots: [{ dayOfWeek: 5, startMinutes: 15 * 60, durationMinutes: 60 }],
  };
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    ...details,
    schedule,
  });
  const original = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(original).toHaveLength(2);
  const baseline = (await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  }))!;
  const expanded = { ...schedule, startDate: "2026-11-02" };
  expect(
    await admin.query(api.events.previewScheduleChange, {
      eventId,
      schedule: expanded,
      now: Date.now(),
    }),
  ).toMatchObject({ removedCount: 0, addedCount: 0 });
  await admin.mutation(api.events.updateDetails, {
    eventId,
    ...details,
    scheduleEdit: {
      mode: "replace",
      schedule: expanded,
      reason: "",
      expectedFutureCount: baseline.futureCount,
      expectedFutureFingerprint: baseline.futureFingerprint,
    },
  });
  const unchanged = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(unchanged.map(({ _id }) => _id)).toEqual(
    original.map(({ _id }) => _id),
  );
  expect(unchanged.every(({ status }) => status === "scheduled")).toBe(true);

  const extended = { ...expanded, endDate: "2026-11-20" };
  expect(
    await admin.query(api.events.previewScheduleChange, {
      eventId,
      schedule: extended,
      now: Date.now(),
    }),
  ).toMatchObject({ removedCount: 0, addedCount: 1 });
  const addBaseline = (await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  }))!;
  await admin.mutation(api.events.updateDetails, {
    eventId,
    ...details,
    scheduleEdit: {
      mode: "replace",
      schedule: extended,
      reason: "",
      expectedFutureCount: addBaseline.futureCount,
      expectedFutureFingerprint: addBaseline.futureFingerprint,
    },
  });
  const added = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(added).toHaveLength(3);
  expect(added.slice(0, 2).map(({ _id }) => _id)).toEqual(
    original.map(({ _id }) => _id),
  );

  const narrowed = { ...expanded, endDate: "2026-11-06" };
  expect(
    await admin.query(api.events.previewScheduleChange, {
      eventId,
      schedule: narrowed,
      now: Date.now(),
    }),
  ).toMatchObject({ removedCount: 2, addedCount: 0 });
  const removeBaseline = (await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  }))!;
  const removal = {
    eventId,
    ...details,
    scheduleEdit: {
      mode: "replace" as const,
      schedule: narrowed,
      reason: "",
      expectedFutureCount: removeBaseline.futureCount,
      expectedFutureFingerprint: removeBaseline.futureFingerprint,
    },
  };
  await expect(
    admin.mutation(api.events.updateDetails, removal),
  ).rejects.toThrow("INVALID_CANCELLATION_REASON");
  await admin.mutation(api.events.updateDetails, {
    ...removal,
    scheduleEdit: { ...removal.scheduleEdit, reason: "Shortened" },
  });
  const final = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(final.find(({ _id }) => _id === original[0]._id)?.status).toBe(
    "scheduled",
  );
  expect(final.filter(({ status }) => status === "cancelled")).toHaveLength(2);
});

test("a single-date event becomes weekly by replacing its future date", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 86_400_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const details = {
    eventId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
  };
  await admin.mutation(api.events.updateDetails, {
    ...details,
    scheduleEdit: {
      mode: "replace",
      schedule: {
        kind: "weekly",
        startDate: "2030-10-28",
        endDate: "2030-11-11",
        slots: [{ dayOfWeek: 1, startMinutes: 9 * 60, durationMinutes: 60 }],
      },
      reason: "Weekly instead",
      expectedFutureCount: 1,
      expectedFutureFingerprint: await expectedFutureFingerprint(f, eventId),
    },
  });
  const rows = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(rows.filter((row) => row.status === "scheduled")).toHaveLength(3);
  expect(rows.filter((row) => row.status === "cancelled")).toHaveLength(1);
  expect(
    (await f.t.run((ctx) => ctx.db.get(eventId)))?.weeklySlots,
  ).toHaveLength(1);
});

test("a stale edit cannot replace a changed schedule with the same number of dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 86_400_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const snapshot = (await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  }))!;
  const details = {
    eventId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
  };
  const scheduleEdit = {
    mode: "replace" as const,
    reason: "New time",
    expectedFutureCount: snapshot.futureCount,
    expectedFutureFingerprint: snapshot.futureFingerprint,
  };
  await admin.mutation(api.events.updateDetails, {
    ...details,
    scheduleEdit: {
      ...scheduleEdit,
      schedule: {
        kind: "single",
        start: SINGLE_START + 60 * 60_000,
        end: SINGLE_END + 60 * 60_000,
      },
    },
  });
  await expect(
    admin.mutation(api.events.updateDetails, {
      ...details,
      scheduleEdit: {
        ...scheduleEdit,
        schedule: {
          kind: "single",
          start: SINGLE_START + 2 * 60 * 60_000,
          end: SINGLE_END + 2 * 60 * 60_000,
        },
      },
    }),
  ).rejects.toThrow("EVENT_SCHEDULE_CHANGED");
});

test("a stale edit cannot reinterpret dates after the event time zone changes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 86_400_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const snapshot = (await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  }))!;
  await f.t.run((ctx) =>
    ctx.db.patch(eventId, { timeZone: "America/New_York" }),
  );
  await expect(
    admin.mutation(api.events.updateDetails, {
      eventId,
      title: "Assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      scheduleEdit: {
        mode: "replace",
        schedule: {
          kind: "single",
          start: SINGLE_START + 60 * 60_000,
          end: SINGLE_END + 60 * 60_000,
        },
        reason: "New time",
        expectedFutureCount: snapshot.futureCount,
        expectedFutureFingerprint: snapshot.futureFingerprint,
      },
    }),
  ).rejects.toThrow("EVENT_SCHEDULE_CHANGED");
});

test("a finished one-date event can schedule another date", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 60_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  vi.setSystemTime(SINGLE_END + 1);
  await admin.mutation(api.events.updateDetails, {
    eventId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    scheduleEdit: {
      mode: "replace",
      schedule: {
        kind: "single",
        start: SINGLE_START + 86_400_000,
        end: SINGLE_END + 86_400_000,
      },
      reason: "",
      expectedFutureCount: 0,
      expectedFutureFingerprint: await expectedFutureFingerprint(f, eventId),
    },
  });
  const dates = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(dates.map((date) => [date.scheduledStart, date.status])).toEqual([
    [SINGLE_START, "scheduled"],
    [SINGLE_START + 86_400_000, "scheduled"],
  ]);
});

test("a finished weekly event cannot schedule more dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 60_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: {
      kind: "weekly",
      startDate: "2030-10-23",
      endDate: "2030-10-23",
      slots: [
        {
          dayOfWeek: new Date(SINGLE_START).getUTCDay(),
          startMinutes: 9 * 60,
          durationMinutes: 60,
        },
      ],
    },
  });
  vi.setSystemTime(SINGLE_END + 1);
  await expect(
    admin.mutation(api.events.updateDetails, {
      eventId,
      title: "Assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      scheduleEdit: {
        mode: "replace",
        schedule: {
          kind: "weekly",
          startDate: "2030-10-24",
          endDate: "2030-10-24",
          slots: [
            {
              dayOfWeek: new Date(SINGLE_START + 86_400_000).getUTCDay(),
              startMinutes: 9 * 60,
              durationMinutes: 60,
            },
          ],
        },
        reason: "",
        expectedFutureCount: 0,
        expectedFutureFingerprint: await expectedFutureFingerprint(f, eventId),
      },
    }),
  ).rejects.toThrow("EVENT_NO_FUTURE_SESSIONS");
});

test("an administrator can delete a past event; teachers and foreign admins cannot", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 60_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const occurrence = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .unique(),
  );
  vi.setSystemTime(SINGLE_END + 1);
  await expect(
    f.t
      .withIdentity({ subject: "teacher" })
      .mutation(api.events.remove, { eventId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.t
      .withIdentity({ subject: "otherAdmin" })
      .mutation(api.events.remove, { eventId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(await admin.mutation(api.events.remove, { eventId })).toEqual({
    deleted: true,
  });
  expect(await f.t.run((ctx) => ctx.db.get(eventId))).toBeNull();
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.run((ctx) => ctx.db.get(occurrence!._id))).toBeNull();
});

test("an active room blocks event changes and deletion until it ends", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 23));
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    gradeCodes: ["05"],
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: {
      kind: "weekly",
      startDate: "2030-10-23",
      endDate: "2030-10-30",
      slots: [{ dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 60 }],
    },
  });
  const laterId = (await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q
          .eq("eventId", eventId)
          .eq("scheduledStart", SINGLE_START + 7 * 86_400_000),
      )
      .unique(),
  ))!._id;
  const activeId = await f.t.run(async (ctx) => {
    const occurrence = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId).eq("scheduledStart", SINGLE_START),
      )
      .unique();
    await ctx.db.patch(occurrence!._id, {
      status: "active",
      isLive: true,
      sessionLeaderId: f.teacher,
    });
    return occurrence!._id;
  });
  expect(await admin.query(api.events.hasActiveRoom, { eventId })).toBe(true);
  const details = {
    eventId,
    campusId: f.campusId,
    gradeCodes: ["05"],
    title: "Updated assembly",
    responsibleId: f.teacher,
    teacherIds: [] as (typeof f.teacher)[],
  };
  await expect(
    admin.mutation(api.events.updateDetails, details),
  ).rejects.toThrow("EVENT_ROOM_ACTIVE");
  await expect(
    admin.mutation(api.events.updateDetails, {
      ...details,
      scheduleEdit: {
        mode: "replace",
        schedule: {
          kind: "single",
          start: SINGLE_START + 2 * 86_400_000,
          end: SINGLE_END + 2 * 86_400_000,
        },
        reason: "New time",
        expectedFutureCount: 1,
        expectedFutureFingerprint: await expectedFutureFingerprint(f, eventId),
      },
    }),
  ).rejects.toThrow("EVENT_ROOM_ACTIVE");
  await expect(admin.mutation(api.events.remove, { eventId })).rejects.toThrow(
    "EVENT_ROOM_ACTIVE",
  );
  await expect(
    admin.mutation(api.events.cancelOccurrence, {
      occurrenceId: laterId,
      reason: "Cancelled",
    }),
  ).rejects.toThrow("EVENT_ROOM_ACTIVE");
  await expect(
    admin.mutation(api.events.cancelFuture, {
      occurrenceId: laterId,
      reason: "Cancelled",
    }),
  ).rejects.toThrow("EVENT_ROOM_ACTIVE");
  await expect(
    f.t.run((ctx) => deleteCampusEvents(ctx, f.campusId)),
  ).rejects.toThrow("EVENT_ROOM_ACTIVE");
  await expect(
    f.t.run((ctx) => removeGradeFromEvents(ctx, f.schoolId, "05")),
  ).rejects.toThrow("EVENT_ROOM_ACTIVE");
  expect((await f.t.run((ctx) => ctx.db.get(eventId)))?.title).toBe("Assembly");
  expect((await f.t.run((ctx) => ctx.db.get(laterId)))?.status).toBe(
    "scheduled",
  );

  await f.t.run(async (ctx) => {
    await ctx.db.patch(activeId, { status: "completed", isLive: false });
  });
  expect(await admin.query(api.events.hasActiveRoom, { eventId })).toBe(false);
  await admin.mutation(api.events.updateDetails, details);
  expect((await f.t.run((ctx) => ctx.db.get(eventId)))?.title).toBe(
    "Updated assembly",
  );
  await admin.mutation(api.events.remove, { eventId });
  expect(await f.t.run((ctx) => ctx.db.get(eventId))).toBeNull();
});

test("date changes and event deletion notify the invited audience", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 60 * 60_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    gradeCodes: ["05"],
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  await admin.mutation(api.events.updateDetails, {
    eventId,
    campusId: f.campusId,
    gradeCodes: ["05"],
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    scheduleEdit: {
      mode: "replace",
      schedule: {
        kind: "single",
        start: SINGLE_START + 60 * 60_000,
        end: SINGLE_END + 60 * 60_000,
      },
      reason: "New time",
      expectedFutureCount: 1,
      expectedFutureFingerprint: await expectedFutureFingerprint(f, eventId),
    },
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await f.t.run((ctx) => ctx.db.query("systemNotifications").collect()))
      .filter((notice) => notice.recipientId === f.student)
      .map((notice) => notice.kind),
  ).toContain("event_schedule");
  await admin.mutation(api.events.remove, { eventId });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await f.t.run((ctx) => ctx.db.query("systemNotifications").collect()))
      .filter((notice) => notice.recipientId === f.student)
      .map((notice) => notice.kind),
  ).toContain("event_deleted");
});

async function fixture() {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    async function user(name: string) {
      return await ctx.db.insert("users", {
        clerkId: name,
        firstName: name,
        lastName: "Test",
        fullName: `${name} Test`,
        isActive: true,
        createdAt: 1,
      });
    }
    const admin = await user("admin");
    const otherAdmin = await user("otherAdmin");
    const principal = await user("principal");
    const teacher = await user("teacher");
    const otherTeacher = await user("otherTeacher");
    const student = await user("student");
    const otherStudent = await user("otherStudent");
    const tutor = await user("tutor");
    const schoolId = await ctx.db.insert("schools", {
      name: "School A",
      slug: "school-a",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const otherSchoolId = await ctx.db.insert("schools", {
      name: "School B",
      slug: "school-b",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: 1,
      createdBy: otherAdmin,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Main",
      slug: "main",
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const otherCampusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Second",
      slug: "second",
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const foreignCampusId = await ctx.db.insert("campuses", {
      schoolId: otherSchoolId,
      name: "Foreign",
      slug: "foreign",
      isActive: true,
      createdAt: 1,
      createdBy: otherAdmin,
    });
    for (const code of ["05", "06"]) {
      await ctx.db.insert("institutionGrades", {
        schoolId,
        code,
        name: `Grade ${code}`,
        order: Number(code),
        createdAt: 1,
        createdBy: admin,
      });
    }
    async function assign(
      userId: typeof admin,
      role: "admin" | "principal" | "teacher" | "student" | "tutor",
      orgType: "school" | "campus",
      orgId: typeof schoolId | typeof campusId,
      assignedSchoolId: typeof schoolId,
      gradeCode?: string,
    ) {
      return await ctx.db.insert("roleAssignments", {
        userId,
        role,
        orgType,
        orgId,
        schoolId: assignedSchoolId,
        gradeCode,
        assignedAt: 1,
      });
    }
    await assign(admin, "admin", "school", schoolId, schoolId);
    await assign(otherAdmin, "admin", "school", otherSchoolId, otherSchoolId);
    await assign(principal, "principal", "campus", campusId, schoolId);
    await assign(teacher, "teacher", "campus", campusId, schoolId);
    await assign(otherTeacher, "teacher", "campus", otherCampusId, schoolId);
    const studentAssignmentId = await assign(
      student,
      "student",
      "campus",
      campusId,
      schoolId,
      "05",
    );
    await assign(
      otherStudent,
      "student",
      "campus",
      otherCampusId,
      schoolId,
      "05",
    );
    await assign(tutor, "tutor", "campus", campusId, schoolId);
    return {
      admin,
      otherAdmin,
      principal,
      teacher,
      otherTeacher,
      student,
      otherStudent,
      tutor,
      schoolId,
      otherSchoolId,
      campusId,
      otherCampusId,
      foreignCampusId,
      studentAssignmentId,
    };
  });
  return { t, ...data };
}

test("event audience follows current grade and campus membership", async () => {
  const f = await fixture();
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      gradeCodes: ["05"],
      title: "Flag ceremony",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
    });
  const readAccess = () =>
    f.t.run(async (ctx) => {
      const event = (await ctx.db.get(eventId))!;
      return {
        student: await canAccessEvent(ctx, f.student, event),
        otherStudent: await canAccessEvent(ctx, f.otherStudent, event),
        teacher: await canAccessEvent(ctx, f.teacher, event),
        otherTeacher: await canAccessEvent(ctx, f.otherTeacher, event),
        tutor: await canAccessEvent(ctx, f.tutor, event),
        otherAdmin: await canAccessEvent(ctx, f.otherAdmin, event),
      };
    });
  expect(await readAccess()).toEqual({
    student: true,
    otherStudent: false,
    teacher: true,
    otherTeacher: false,
    tutor: false,
    otherAdmin: false,
  });
  await f.t.run((ctx) =>
    ctx.db.patch(f.studentAssignmentId, { gradeCode: "06" }),
  );
  expect((await readAccess()).student).toBe(false);
  await f.t.run((ctx) =>
    ctx.db.patch(f.studentAssignmentId, { gradeCode: "05" }),
  );
  expect((await readAccess()).student).toBe(true);
});

test("student dashboard includes only event dates in the student's audience", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 60 * 60_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const create = (
    title: string,
    campusId: Id<"campuses"> | undefined,
    gradeCodes: string[],
  ) =>
    admin.mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId,
      gradeCodes,
      title,
      responsibleId: campusId === f.otherCampusId ? f.otherTeacher : f.teacher,
      teacherIds: [],
      schedule: {
        kind: "single" as const,
        start: SINGLE_START,
        end: SINGLE_END,
      },
    });
  const institutionId = await create("Assembly", undefined, ["05"]);
  const campusId = await create("Campus meeting", f.campusId, ["05"]);
  await create("Other campus", f.otherCampusId, ["05"]);
  await create("Other grade", f.campusId, ["06"]);

  const dates = (
    await Promise.all(
      (["school", "campus"] as const).map((scope) =>
        f.t
          .withIdentity({ subject: "student" })
          .query(api.student.getStudentDashboardEvents, {
            from: SINGLE_START - 60 * 60_000,
            to: SINGLE_END,
            scope,
            paginationOpts: { numItems: 10, cursor: null },
          }),
      ),
    )
  ).flatMap((result) => result.page);
  expect(dates.map((date) => date.eventId)).toEqual([institutionId, campusId]);
  expect(dates.map((date) => date.title)).toEqual([
    "Assembly",
    "Campus meeting",
  ]);
  expect(
    await f.t
      .withIdentity({ subject: "otherStudent" })
      .query(api.student.getStudentDashboardEvents, {
        studentId: f.student,
        orgSlug: "main",
        from: SINGLE_START - 60 * 60_000,
        to: SINGLE_END,
        scope: "campus",
        paginationOpts: { numItems: 10, cursor: null },
      }),
  ).toMatchObject({ page: [], isDone: true });
});

test("student dashboard finds visible events after cancelled and inaccessible dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 2 * 60 * 60_000);
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const create = (
    title: string,
    campusId: Id<"campuses"> | undefined,
    gradeCodes: string[],
    start: number,
  ) =>
    admin.mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId,
      gradeCodes,
      title,
      responsibleId: campusId === f.otherCampusId ? f.otherTeacher : f.teacher,
      teacherIds: [],
      schedule: { kind: "single" as const, start, end: start + 60 * 60_000 },
    });
  const earlier = SINGLE_START - 60 * 60_000;
  const later = SINGLE_START + 2 * 60 * 60_000;
  const cancelledId = await create("Cancelled", undefined, ["05"], earlier);
  const hiddenId = await create("Other grade", f.campusId, ["06"], earlier);
  const schoolVisibleId = await create(
    "School assembly",
    undefined,
    ["05"],
    later,
  );
  const campusVisibleId = await create(
    "Campus assembly",
    f.campusId,
    ["05"],
    later,
  );
  await f.t.run(async (ctx) => {
    const cancelled = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", cancelledId),
      )
      .unique();
    await ctx.db.patch(cancelled!._id, { status: "cancelled" });
    for (let i = 0; i < 99; i++) {
      await ctx.db.insert("eventOccurrences", {
        eventId: cancelledId,
        schoolId: f.schoolId,
        scheduledStart: earlier,
        scheduledEnd: earlier + 60 * 60_000,
        status: "cancelled",
        roomName: `cancelled-${i}`,
        createdAt: Date.now(),
        createdBy: f.admin,
      });
      await ctx.db.insert("eventOccurrences", {
        eventId: hiddenId,
        schoolId: f.schoolId,
        campusId: f.campusId,
        scheduledStart: earlier,
        scheduledEnd: earlier + 60 * 60_000,
        status: "scheduled",
        roomName: `hidden-${i}`,
        createdAt: Date.now(),
        createdBy: f.admin,
      });
    }
  });

  const dates = [];
  for (const scope of ["school", "campus"] as const) {
    let cursor: string | null = null;
    let isDone = false;
    let pagesRead = 0;
    while (!isDone) {
      const result: {
        page: { eventId: Id<"events"> }[];
        continueCursor: string;
        isDone: boolean;
      } = await f.t
        .withIdentity({ subject: "student" })
        .query(api.student.getStudentDashboardEvents, {
          from: SINGLE_START - 2 * 60 * 60_000,
          to: later + 60 * 60_000,
          scope,
          paginationOpts: { numItems: 20, cursor },
        });
      dates.push(...result.page);
      cursor = result.continueCursor;
      isDone = result.isDone;
      pagesRead++;
    }
    expect(pagesRead).toBeGreaterThan(1);
  }
  expect(dates.map((date) => date.eventId)).toEqual([
    schoolVisibleId,
    campusVisibleId,
  ]);
});

test("an event room admits its current audience and has one transferable leader", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 60 * 60_000);
  const f = await fixture();
  await f.t.run(async (ctx) => {
    const assignment = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", f.otherTeacher))
      .unique();
    await ctx.db.patch(assignment!._id, { orgId: f.campusId });
  });
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      gradeCodes: ["05"],
      title: "Flag ceremony",
      responsibleId: f.teacher,
      teacherIds: [f.otherTeacher],
      schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
    });
  const occurrence = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .unique(),
  );
  const roomName = occurrence!.roomName;
  vi.setSystemTime(SINGLE_START);
  await expect(
    f.t.withIdentity({ subject: "student" }).mutation(api.eventRoom.start, {
      roomName,
    }),
  ).rejects.toThrow();
  await f.t.withIdentity({ subject: "teacher" }).mutation(api.eventRoom.start, {
    roomName,
  });

  const access = (userId: typeof f.teacher) =>
    f.t.query(internal.eventRoom.checkLiveKitAccess, {
      userId,
      roomName,
      now: SINGLE_START,
    });
  expect(await access(f.teacher)).toMatchObject({
    authorized: true,
    roomAdmin: true,
    computedRole: "teacher",
  });
  expect(await access(f.principal)).toMatchObject({
    authorized: true,
    roomAdmin: true,
    computedRole: "admin",
  });
  expect(await access(f.student)).toMatchObject({
    authorized: true,
    roomAdmin: false,
    computedRole: "student",
  });
  expect(await access(f.otherTeacher)).toMatchObject({
    authorized: true,
    roomAdmin: true,
    isPrimaryTeacher: true,
    computedRole: "teacher",
  });
  expect((await access(f.tutor))?.authorized).toBe(false);
  expect((await access(f.otherStudent))?.authorized).toBe(false);
  expect(
    await f.t
      .withIdentity({ subject: "otherStudent" })
      .query(api.eventRoom.getSessionStatus, { roomName, now: SINGLE_START }),
  ).toBeNull();

  await f.t
    .withIdentity({ subject: "teacher" })
    .mutation(api.eventRoom.requestSessionLeadershipTransfer, {
      roomName,
      targetUserId: f.principal,
    });
  await f.t
    .withIdentity({ subject: "principal" })
    .mutation(api.eventRoom.acceptSessionLeadershipTransfer, { roomName });
  expect(await access(f.teacher)).toMatchObject({
    roomAdmin: true,
    isSessionLeader: false,
  });
  expect(await access(f.principal)).toMatchObject({
    roomAdmin: true,
    isSessionLeader: true,
  });
  expect(
    (
      await f.t
        .withIdentity({ subject: "otherTeacher" })
        .query(api.eventRoom.getSessionLeadership, {
          roomName,
          now: SINGLE_START,
        })
    )?.viewer.canRecover,
  ).toBe(true);
  const liveRoomName = (await f.t.run((ctx) => ctx.db.get(occurrence!._id)))!
    .liveRoomName!;
  expect(
    await f.t
      .withIdentity({ subject: "student" })
      .query(api.whiteboardSessions.getRealtimeWriter, {
        roomName,
        expectedLiveRoomName: liveRoomName,
        writerId: f.teacher,
      }),
  ).toBe(true);
  expect(
    await f.t
      .withIdentity({ subject: "student" })
      .query(api.whiteboardSessions.getRealtimeWriter, {
        roomName,
        expectedLiveRoomName: liveRoomName,
        writerId: f.principal,
      }),
  ).toBe(true);
  await expect(
    f.t
      .withIdentity({ subject: "teacher" })
      .mutation(api.eventRoom.requestSessionLeadershipTransfer, {
        roomName,
        targetUserId: f.admin,
      }),
  ).rejects.toThrow();

  const principal = f.t.withIdentity({ subject: "principal" });
  const teacher = f.t.withIdentity({ subject: "teacher" });
  await principal.mutation(api.eventRoom.requestSessionLeadershipTransfer, {
    roomName,
    targetUserId: f.teacher,
  });
  await teacher.mutation(api.eventRoom.rejectSessionLeadershipTransfer, {
    roomName,
  });
  const firstOutcome = await principal.query(
    api.eventRoom.getSessionLeadership,
    {
      roomName,
      now: SINGLE_START,
    },
  );
  await principal.mutation(api.eventRoom.requestSessionLeadershipTransfer, {
    roomName,
    targetUserId: f.teacher,
  });
  await teacher.mutation(api.eventRoom.rejectSessionLeadershipTransfer, {
    roomName,
  });
  const secondOutcome = await principal.query(
    api.eventRoom.getSessionLeadership,
    { roomName, now: SINGLE_START },
  );
  expect(firstOutcome?.latestTransferOutcome?.eventId).toBeTruthy();
  expect(secondOutcome?.latestTransferOutcome?.eventId).not.toBe(
    firstOutcome?.latestTransferOutcome?.eventId,
  );
  await expect(
    f.t
      .withIdentity({ subject: "admin" })
      .mutation(api.eventRoom.recoverSessionLeadership, { roomName }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await f.t
    .withIdentity({ subject: "otherTeacher" })
    .mutation(api.eventRoom.recoverSessionLeadership, { roomName });
  expect(
    (await f.t.run((ctx) => ctx.db.get(occurrence!._id)))?.sessionLeaderId,
  ).toBe(f.otherTeacher);
});

test("an event closes and reopens without an academic report", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(SINGLE_START - 60 * 60_000);
  const f = await fixture();
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      title: "Devotional",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
    });
  const occurrence = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .unique(),
  );
  const roomName = occurrence!.roomName;
  vi.setSystemTime(SINGLE_START);
  await f.t.withIdentity({ subject: "teacher" }).mutation(api.eventRoom.start, {
    roomName,
  });
  const active = await f.t.run((ctx) => ctx.db.get(occurrence!._id));
  await f.t
    .withIdentity({ subject: "teacher" })
    .mutation(api.whiteboardSessions.ensureScene, {
      roomName,
      expectedLiveRoomName: active!.liveRoomName!,
    });
  await f.t.run(async (ctx) => {
    const session = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const manifest = await ctx.db
      .query("whiteboardSceneManifests")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    await ctx.db.patch(session!._id, { recordingToken: "recording-token" });
    await ctx.db.patch(manifest!._id, { recordingToken: "recording-token" });
  });
  expect(
    await f.t.query(api.whiteboardSessions.getSceneManifest, {
      roomName,
      recordingToken: "recording-token",
    }),
  ).not.toBeNull();
  expect(
    await f.t
      .withIdentity({ subject: "student" })
      .query(api.whiteboardSessions.getSceneManifest, { roomName }),
  ).not.toBeNull();
  expect(
    await f.t
      .withIdentity({ subject: "teacher" })
      .query(api.whiteboardSessions.getRealtimeAudience, {
        roomName,
        expectedLiveRoomName: active!.liveRoomName!,
        participants: [
          { identity: "student", userId: f.student },
          { identity: "otherStudent", userId: f.otherStudent },
        ],
      }),
  ).toEqual(["student"]);
  await expect(
    f.t
      .withIdentity({ subject: "student" })
      .mutation(api.whiteboardSessions.ensureScene, {
        roomName,
        expectedLiveRoomName: active!.liveRoomName!,
      }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.t
      .withIdentity({ subject: "otherStudent" })
      .query(api.whiteboardSessions.getSceneManifest, { roomName }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await f.t.query(api.whiteboardSessions.getRecordingContext, {
      roomName,
      recordingToken: "recording-token",
    }),
  ).toMatchObject({ eventId, eventTitle: "Devotional" });
  expect(
    await f.t.mutation(internal.eventRoom.claimLiveSessionEnd, {
      roomName,
      expectedActivationId: active!.liveActivationId!,
      claimId: "close-1",
      endedAt: SINGLE_START + 1,
      endedBy: f.teacher,
    }),
  ).toBe(true);
  expect((await f.t.run((ctx) => ctx.db.get(occurrence!._id)))?.status).toBe(
    "completed",
  );
  await expect(
    f.t.query(api.whiteboardSessions.getSceneManifest, {
      roomName,
      recordingToken: "recording-token",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await f.t.run(async (ctx) => {
      const session = await ctx.db
        .query("whiteboardSessions")
        .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
        .unique();
      const manifest = await ctx.db
        .query("whiteboardSceneManifests")
        .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
        .unique();
      return [
        Boolean(session?.recordingToken),
        Boolean(manifest?.recordingToken),
      ];
    }),
  ).toEqual([false, false]);
  expect(
    await f.t.mutation(internal.eventRoom.completeLiveSessionEnd, {
      roomName,
      expectedActivationId: active!.liveActivationId!,
      claimId: "close-1",
    }),
  ).toBe(true);
  await f.t
    .withIdentity({ subject: "teacher" })
    .mutation(api.eventRoom.reopen, {
      roomName,
    });
  const reopened = await f.t.run((ctx) => ctx.db.get(occurrence!._id));
  expect(reopened).toMatchObject({ status: "active", isLive: true });
  expect(reopened?.liveActivationId).not.toBe(active?.liveActivationId);
});

test("hierarchy deletion waits for live room cleanup before removing an event occurrence", async () => {
  vi.useFakeTimers();
  for (const key of [
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ENDPOINT",
  ])
    vi.stubEnv(key, "test");
  vi.setSystemTime(SINGLE_START - 60 * 60_000);
  const f = await fixture();
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      title: "Devotional",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
    });
  const occurrence = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .unique(),
  );
  vi.setSystemTime(SINGLE_START);
  await f.t.withIdentity({ subject: "teacher" }).mutation(api.eventRoom.start, {
    roomName: occurrence!.roomName,
  });
  await f.t.run((ctx) => ctx.db.delete(eventId));
  await f.t.mutation(internal.events.removeOccurrencesByEvent, { eventId });
  const closing = await f.t.run(async (ctx) => ({
    occurrence: await ctx.db.get(occurrence!._id),
    activation: await ctx.db
      .query("liveRoomActivations")
      .withIndex("by_event_occurrence", (q) =>
        q.eq("eventOccurrenceId", occurrence!._id),
      )
      .unique(),
  }));
  expect(closing.occurrence).toMatchObject({ isLive: false });
  expect(closing.activation?.status).toBe("closing");
  await f.t.mutation(internal.liveRoomLifecycle.finishCleanup, {
    activationId: closing.activation!.activationId,
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.run((ctx) => ctx.db.get(occurrence!._id))).toBeNull();
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("liveRoomActivations")
        .withIndex("by_event_occurrence", (q) =>
          q.eq("eventOccurrenceId", occurrence!._id),
        )
        .collect(),
    ),
  ).toEqual([]);
});

test("event directory keeps events accessible between weekly dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 23));
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    title: "Flag ceremony",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: {
      kind: "weekly",
      startDate: "2030-10-23",
      endDate: "2030-10-30",
      slots: [{ dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 60 }],
    },
  });
  const listAt = (now: number) =>
    admin.query(api.events.list, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      now,
      paginationOpts: { numItems: 10, cursor: null },
    });

  expect((await listAt(SINGLE_START - 1)).page[0]).toMatchObject({
    _id: eventId,
    nextOccurrenceStart: SINGLE_START,
  });
  const nextStart = SINGLE_START + 7 * 86_400_000;
  expect((await listAt(SINGLE_END + 1)).page[0]?.nextOccurrenceStart).toBe(
    nextStart,
  );
});

test("an ongoing scheduled event stays upcoming until its end", async () => {
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const list = (now: number) =>
    admin.query(api.events.list, {
      schoolId: f.schoolId,
      now,
      paginationOpts: { numItems: 10, cursor: null },
    });
  const dates = (category: "upcoming" | "past", now: number) =>
    admin.query(api.events.listOccurrences, {
      eventId,
      category,
      now,
      paginationOpts: { numItems: 10, cursor: null },
    });
  const during = SINGLE_START + 5 * 60_000;
  expect((await list(during)).page[0]?.nextOccurrenceStart).toBe(SINGLE_START);
  expect(
    await admin.query(api.events.nextOccurrence, { eventId, now: during }),
  ).toMatchObject({ start: SINGLE_START, status: "scheduled" });
  expect((await dates("upcoming", during)).page).toHaveLength(1);
  expect((await dates("past", during)).page).toHaveLength(0);

  const after = SINGLE_END + 1;
  expect((await list(after)).page[0]?.nextOccurrenceStart).toBeNull();
  expect(
    await admin.query(api.events.nextOccurrence, { eventId, now: after }),
  ).toBeNull();
  expect((await dates("upcoming", after)).page).toHaveLength(0);
  expect((await dates("past", after)).page).toHaveLength(1);
});

test("an early completed event moves to history and remains reopenable for leaders", async () => {
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const now = SINGLE_START - 20 * 60_000;
  const occurrenceId = await f.t.run(async (ctx) => {
    const occurrence = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .unique();
    await ctx.db.patch(occurrence!._id, {
      status: "completed",
      isLive: false,
      sessionStartedAt: now - 5 * 60_000,
      completedAt: now,
      sessionReopenUntil: SINGLE_END + 10 * 60_000,
    });
    return occurrence!._id;
  });
  const page = (category: "upcoming" | "past") =>
    admin.query(api.events.listOccurrences, {
      eventId,
      category,
      now,
      paginationOpts: { numItems: 10, cursor: null },
    });

  expect((await page("past")).page.map((row) => row._id)).toEqual([
    occurrenceId,
  ]);
  expect((await page("upcoming")).page).toEqual([]);
  expect(
    await admin.query(api.events.nextOccurrence, { eventId, now }),
  ).toMatchObject({
    _id: occurrenceId,
    status: "completed",
  });
  expect(
    await f.t
      .withIdentity({ subject: "teacher" })
      .query(api.events.nextOccurrence, { eventId, now }),
  ).toMatchObject({ _id: occurrenceId });
  expect(
    await f.t
      .withIdentity({ subject: "student" })
      .query(api.events.nextOccurrence, { eventId, now }),
  ).toBeNull();
  expect(
    await admin.query(api.events.nextOccurrence, {
      eventId,
      now: SINGLE_END + 10 * 60_000,
    }),
  ).toBeNull();
});

test("event directory searches all pages without exposing other campuses or schools", async () => {
  const f = await fixture();
  const targetId = await f.t.run(async (ctx) => {
    const insert = (
      title: string,
      schoolId = f.schoolId,
      campusId = f.campusId,
    ) =>
      ctx.db.insert("events", {
        schoolId,
        campusId,
        title,
        responsibleId: f.teacher,
        teacherIds: [],
        timeZone: "America/Bogota",
        createdAt: 1,
        createdBy: f.admin,
      });
    const target = await insert("Ceremonia de bandera");
    for (let index = 0; index < 35; index++) await insert(`Evento ${index}`);
    await insert("Ceremonia de otro campus", f.schoolId, f.otherCampusId);
    await insert(
      "Ceremonia de otra institución",
      f.otherSchoolId,
      f.foreignCampusId,
    );
    return target;
  });
  const page = await f.t
    .withIdentity({ subject: "student" })
    .query(api.events.list, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      search: "ceremonia",
      now: SINGLE_START,
      paginationOpts: { numItems: 10, cursor: null },
    });
  expect(page.page.map((event) => event._id)).toEqual([targetId]);
});

test("event detail keeps a live session ahead of the next scheduled date", async () => {
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Devotional",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: {
      kind: "weekly",
      startDate: "2030-10-23",
      endDate: "2030-10-30",
      slots: [{ dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 60 }],
    },
  });
  const liveId = await f.t.run(async (ctx) => {
    const occurrence = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .first();
    await ctx.db.patch(occurrence!._id, { status: "active" });
    return occurrence!._id;
  });
  expect(
    await admin.query(api.events.nextOccurrence, {
      eventId,
      now: SINGLE_START + 1,
    }),
  ).toMatchObject({ _id: liveId, status: "active" });
  expect(
    (
      await admin.query(api.events.listOccurrences, {
        eventId,
        category: "past",
        now: SINGLE_END + 1,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page,
  ).toEqual([]);
});

test("teacher options follow the event scope and creator permission", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.teacher, { email: "teacher@example.com" }),
  );
  const admin = f.t.withIdentity({ subject: "admin" });
  const institutional = await admin.query(api.events.listTeacherOptions, {
    schoolId: f.schoolId,
  });
  const campus = await admin.query(api.events.listTeacherOptions, {
    schoolId: f.schoolId,
    campusId: f.campusId,
  });
  expect(institutional.map((teacher) => teacher._id)).toContain(f.otherTeacher);
  expect(institutional.map((teacher) => teacher._id)).not.toContain(f.admin);
  expect(campus.map((teacher) => teacher._id)).toContain(f.teacher);
  expect(campus.map((teacher) => teacher._id)).not.toContain(f.otherTeacher);
  expect(campus.find((teacher) => teacher._id === f.teacher)).toMatchObject({
    email: "teacher@example.com",
    role: "teacher",
  });
  expect(campus.find((teacher) => teacher._id === f.principal)?.role).toBe(
    "principal",
  );
  expect(
    await f.t
      .withIdentity({ subject: "principal" })
      .query(api.events.listTeacherOptions, {
        schoolId: f.schoolId,
        campusId: f.campusId,
      }),
  ).toHaveLength(2);
  await expect(
    f.t
      .withIdentity({ subject: "principal" })
      .query(api.events.listTeacherOptions, { schoolId: f.schoolId }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("institutional grade events include current students across campuses", async () => {
  const f = await fixture();
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      gradeCodes: ["05"],
      title: "Exam briefing",
      responsibleId: f.teacher,
      teacherIds: [f.otherTeacher],
      schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
    });
  const access = await f.t.run(async (ctx) => {
    const event = (await ctx.db.get(eventId))!;
    return [
      await canAccessEvent(ctx, f.student, event),
      await canAccessEvent(ctx, f.otherStudent, event),
      await canAccessEvent(ctx, f.otherTeacher, event),
      await canAccessEvent(ctx, f.otherAdmin, event),
    ];
  });
  expect(access).toEqual([true, true, true, false]);
});

test("whole institution and whole campus scopes invite their current members", async () => {
  const f = await fixture();
  const create = (campusId?: typeof f.campusId) =>
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId,
      title: "Assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
    });
  const institutionId = await create();
  const campusId = await create(f.campusId);
  const access = await f.t.run(async (ctx) => {
    const institution = (await ctx.db.get(institutionId))!;
    const campus = (await ctx.db.get(campusId))!;
    return {
      institution: [
        await canAccessEvent(ctx, f.student, institution),
        await canAccessEvent(ctx, f.otherStudent, institution),
        await canAccessEvent(ctx, f.otherTeacher, institution),
      ],
      campus: [
        await canAccessEvent(ctx, f.student, campus),
        await canAccessEvent(ctx, f.otherStudent, campus),
        await canAccessEvent(ctx, f.otherTeacher, campus),
      ],
    };
  });
  expect(access).toEqual({
    institution: [true, true, true],
    campus: [true, false, false],
  });
});

test("campus principal can create campus event, but unauthorized scopes and teachers fail", async () => {
  const f = await fixture();
  const base = {
    schoolId: f.schoolId,
    campusId: f.campusId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [] as (typeof f.teacher)[],
    schedule: { kind: "single" as const, start: SINGLE_START, end: SINGLE_END },
  };
  await expect(
    f.t
      .withIdentity({ subject: "principal" })
      .mutation(api.events.create, base),
  ).resolves.toBeDefined();
  await expect(
    f.t.withIdentity({ subject: "teacher" }).mutation(api.events.create, base),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.t
      .withIdentity({ subject: "otherAdmin" })
      .mutation(api.events.create, base),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.t.withIdentity({ subject: "principal" }).mutation(api.events.create, {
      ...base,
      campusId: f.otherCampusId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      ...base,
      campusId: f.foreignCampusId,
    }),
  ).rejects.toThrow("INVALID_EVENT_SCOPE");
  await expect(
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      ...base,
      responsibleId: f.otherTeacher,
    }),
  ).rejects.toThrow("INVALID_EVENT_TEACHER");
  await expect(
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      ...base,
      gradeCodes: ["99"],
    }),
  ).rejects.toThrow("INVALID_EVENT_GRADES");
});

test("weekly dates preserve local time across DST", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.schoolId, { timeZone: "America/New_York" }),
  );
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      title: "Devotional",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "weekly",
        startDate: "2030-10-27",
        endDate: "2030-11-10",
        slots: [{ dayOfWeek: 0, startMinutes: 9 * 60, durationMinutes: 45 }],
      },
    });
  const rows = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(rows).toHaveLength(3);
  expect(rows.map((row) => row.scheduledStart)).toEqual([
    localDateTimeToUtc("2030-10-27T09:00", "America/New_York"),
    localDateTimeToUtc("2030-11-03T09:00", "America/New_York"),
    localDateTimeToUtc("2030-11-10T09:00", "America/New_York"),
  ]);
  expect(new Set(rows.map((row) => row.roomName)).size).toBe(rows.length);
});

test("schedule edits require the institution and campus to remain active", async () => {
  const f = await fixture();
  const create = (campusId?: typeof f.campusId) =>
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId,
      title: "Assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "single" as const,
        start: SINGLE_START,
        end: SINGLE_END,
      },
    });
  const campusEventId = await create(f.campusId);
  const schoolEventId = await create();
  const replace = async (eventId: typeof campusEventId, hours: number) =>
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.updateDetails, {
      eventId,
      campusId: eventId === campusEventId ? f.campusId : undefined,
      title: "Assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      scheduleEdit: {
        mode: "replace",
        schedule: {
          kind: "single",
          start: SINGLE_START + hours * 60 * 60_000,
          end: SINGLE_END + hours * 60 * 60_000,
        },
        reason: "New time",
        expectedFutureCount: 1,
        expectedFutureFingerprint: await expectedFutureFingerprint(f, eventId),
      },
    });

  await f.t.run((ctx) => ctx.db.patch(f.campusId, { isActive: false }));
  await expect(replace(campusEventId, 2)).rejects.toThrow(
    "INVALID_EVENT_SCOPE",
  );
  await expect(replace(schoolEventId, 2)).resolves.toBeNull();

  await f.t.run((ctx) => ctx.db.patch(f.schoolId, { isActive: false }));
  await expect(replace(campusEventId, 4)).rejects.toThrow(
    "INVALID_EVENT_SCOPE",
  );
  await expect(replace(schoolEventId, 4)).rejects.toThrow(
    "INVALID_EVENT_SCOPE",
  );

  const occurrences = await f.t.run((ctx) =>
    ctx.db.query("eventOccurrences").collect(),
  );
  expect(
    occurrences.filter((row) => row.eventId === campusEventId),
  ).toHaveLength(1);
  expect(
    occurrences.filter((row) => row.eventId === schoolEventId),
  ).toHaveLength(2);
});

test("a school-year weekday event fits in one weekly series", async () => {
  const f = await fixture();
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      title: "Devotional",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "weekly",
        startDate: "2030-01-01",
        endDate: "2030-10-07",
        slots: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinutes: 8 * 60,
          durationMinutes: 30,
        })),
      },
    });
  const occurrences = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(occurrences).toHaveLength(200);
  const upcoming = await f.t
    .withIdentity({ subject: "admin" })
    .query(api.events.listOccurrences, {
      eventId,
      category: "upcoming",
      now: Date.UTC(2030, 5, 1),
      paginationOpts: { numItems: 2, cursor: null },
    });
  expect(upcoming.page).toHaveLength(2);
  expect(upcoming.page[0].start).toBeGreaterThanOrEqual(Date.UTC(2030, 5, 1));
  expect(upcoming.page[0].start).toBeLessThan(upcoming.page[1].start);
  expect(
    await f.t.run((ctx) => ctx.db.query("classSchedule").collect()),
  ).toEqual([]);
});

test("weekly events cannot run past midnight even with a full-day window", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.schoolId, {
      scheduleStartMinutes: 0,
      scheduleEndMinutes: 1440,
    }),
  );
  await expect(
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      schoolId: f.schoolId,
      title: "Evening gathering",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "weekly",
        startDate: "2030-10-23",
        endDate: "2030-10-23",
        slots: [
          { dayOfWeek: 3, startMinutes: 23 * 60 + 30, durationMinutes: 90 },
        ],
      },
    }),
  ).rejects.toThrow("OUTSIDE_SCHEDULE_WINDOW");
});

test("event dates use the institution window without changing it or limiting valid duration", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 30));
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const details = {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
  };
  const onDate = (time: string) =>
    localDateTimeToUtc(`2030-10-23T${time}`, "America/Bogota");

  await expect(
    admin.mutation(api.events.create, {
      ...details,
      schedule: {
        kind: "single",
        start: onDate("06:00"),
        end: onDate("07:00"),
      },
    }),
  ).rejects.toThrow("OUTSIDE_SCHEDULE_WINDOW");
  await expect(
    admin.mutation(api.events.create, {
      ...details,
      schedule: {
        kind: "weekly",
        startDate: "2030-10-23",
        endDate: "2030-10-23",
        slots: [{ dayOfWeek: 3, startMinutes: 17 * 60, durationMinutes: 120 }],
      },
    }),
  ).rejects.toThrow("OUTSIDE_SCHEDULE_WINDOW");

  await f.t.run((ctx) =>
    ctx.db.patch(f.schoolId, {
      scheduleStartMinutes: 7 * 60,
      scheduleEndMinutes: 23 * 60,
    }),
  );
  const eventId = await admin.mutation(api.events.create, {
    ...details,
    schedule: { kind: "single", start: onDate("07:00"), end: onDate("23:00") },
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.schoolId))).toMatchObject({
    scheduleStartMinutes: 7 * 60,
    scheduleEndMinutes: 23 * 60,
  });
  const original = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .unique(),
  );
  expect(original!.scheduledEnd - original!.scheduledStart).toBe(
    16 * 60 * 60_000,
  );

  await f.t.run((ctx) =>
    ctx.db.patch(f.schoolId, { scheduleEndMinutes: 18 * 60 }),
  );
  await admin.mutation(api.events.updateDetails, {
    eventId,
    title: "Updated assembly",
    responsibleId: f.teacher,
    teacherIds: [],
  });
  const preview = await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  });
  await expect(
    admin.mutation(api.events.updateDetails, {
      eventId,
      title: "Updated assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      scheduleEdit: {
        mode: "replace",
        schedule: {
          kind: "single",
          start: onDate("07:00"),
          end: onDate("23:00"),
        },
        reason: "Rescheduled",
        expectedFutureCount: preview!.futureCount,
        expectedFutureFingerprint: preview!.futureFingerprint,
      },
    }),
  ).rejects.toThrow("OUTSIDE_SCHEDULE_WINDOW");
  expect(await f.t.run((ctx) => ctx.db.get(original!._id))).toMatchObject({
    scheduledStart: original!.scheduledStart,
    scheduledEnd: original!.scheduledEnd,
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.schoolId))).toMatchObject({
    scheduleStartMinutes: 7 * 60,
    scheduleEndMinutes: 18 * 60,
  });
});

test("single dates validate order, day, window boundaries, and future start on create and edit", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2030, 9, 23, 13)); // 08:00 in Bogotá
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const at = (value: string) =>
    localDateTimeToUtc(`2030-10-${value}`, "America/Bogota");
  const details = {
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
  };
  const baseline = {
    kind: "single" as const,
    start: at("24T09:00"),
    end: at("24T10:00"),
  };
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    ...details,
    schedule: baseline,
  });
  const preview = await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  });
  const invalid: Array<[string, number, number, string]> = [
    ["equal times", at("24T09:00"), at("24T09:00"), "INVALID_EVENT_TIME"],
    ["end before start", at("24T10:00"), at("24T09:00"), "INVALID_EVENT_TIME"],
    ["next day", at("24T17:00"), at("25T08:00"), "INVALID_EVENT_TIME"],
    [
      "before window",
      at("24T06:59"),
      at("24T08:00"),
      "OUTSIDE_SCHEDULE_WINDOW",
    ],
    ["after window", at("24T17:00"), at("24T18:01"), "OUTSIDE_SCHEDULE_WINDOW"],
    ["past start", at("23T07:00"), at("23T08:00"), "INVALID_EVENT_TIME"],
    ["start exactly now", at("23T08:00"), at("23T09:00"), "INVALID_EVENT_TIME"],
  ];
  for (const [name, start, end, error] of invalid) {
    const schedule = { kind: "single" as const, start, end };
    await expect(
      admin.mutation(api.events.create, {
        schoolId: f.schoolId,
        ...details,
        schedule,
      }),
      name,
    ).rejects.toThrow(error);
    await expect(
      admin.mutation(api.events.updateDetails, {
        eventId,
        ...details,
        scheduleEdit: {
          mode: "replace",
          schedule,
          reason: "Change",
          expectedFutureCount: preview!.futureCount,
          expectedFutureFingerprint: preview!.futureFingerprint,
        },
      }),
      name,
    ).rejects.toThrow(error);
  }
  const valid = {
    kind: "single" as const,
    start: at("24T07:00"),
    end: at("24T18:00"),
  };
  const validId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    ...details,
    schedule: valid,
  });
  await admin.mutation(api.events.updateDetails, {
    eventId,
    ...details,
    scheduleEdit: {
      mode: "replace",
      schedule: valid,
      reason: "Change",
      expectedFutureCount: preview!.futureCount,
      expectedFutureFingerprint: preview!.futureFingerprint,
    },
  });
  const rows = await f.t.run((ctx) =>
    ctx.db.query("eventOccurrences").collect(),
  );
  expect(rows.filter((row) => row.eventId === validId)).toHaveLength(1);
  expect(
    rows.filter((row) => row.eventId === eventId && row.status === "scheduled"),
  ).toMatchObject([{ scheduledStart: valid.start, scheduledEnd: valid.end }]);
  expect(
    rows.filter((row) => row.eventId === eventId && row.status === "cancelled"),
  ).toHaveLength(1);
});

test("weekly ranges and hours validate on create and replacement without partial writes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2030, 9, 23, 13)); // 08:00 in Bogotá
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const details = {
    title: "Weekly assembly",
    responsibleId: f.teacher,
    teacherIds: [],
  };
  const baseline = {
    kind: "weekly" as const,
    startDate: "2030-10-24",
    endDate: "2030-10-31",
    slots: [{ dayOfWeek: 4, startMinutes: 9 * 60, durationMinutes: 60 }],
  };
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    ...details,
    schedule: baseline,
  });
  const preview = await admin.query(api.events.getEditingSchedule, {
    eventId,
    now: Date.now(),
  });
  const invalid = [
    [
      "reversed dates",
      { ...baseline, startDate: "2030-10-31", endDate: "2030-10-24" },
      "INVALID_EVENT_RECURRENCE",
    ],
    [
      "no selected weekday in range",
      {
        ...baseline,
        endDate: "2030-10-24",
        slots: [{ dayOfWeek: 3, startMinutes: 540, durationMinutes: 60 }],
      },
      "INVALID_EVENT_RECURRENCE",
    ],
    ["empty weekdays", { ...baseline, slots: [] }, "INVALID_EVENT_RECURRENCE"],
    [
      "duplicate weekday and hour",
      { ...baseline, slots: [baseline.slots[0], baseline.slots[0]] },
      "INVALID_EVENT_RECURRENCE",
    ],
    [
      "invalid weekday",
      {
        ...baseline,
        slots: [{ dayOfWeek: 7, startMinutes: 540, durationMinutes: 60 }],
      },
      "INVALID_EVENT_RECURRENCE",
    ],
    [
      "invalid civil date",
      { ...baseline, startDate: "2030-02-30" },
      "INVALID_EVENT_RECURRENCE",
    ],
    [
      "zero duration",
      {
        ...baseline,
        slots: [{ dayOfWeek: 4, startMinutes: 540, durationMinutes: 0 }],
      },
      "INVALID_EVENT_RECURRENCE",
    ],
    [
      "before window",
      {
        ...baseline,
        slots: [{ dayOfWeek: 4, startMinutes: 419, durationMinutes: 60 }],
      },
      "OUTSIDE_SCHEDULE_WINDOW",
    ],
    [
      "after window",
      {
        ...baseline,
        slots: [{ dayOfWeek: 4, startMinutes: 17 * 60, durationMinutes: 61 }],
      },
      "OUTSIDE_SCHEDULE_WINDOW",
    ],
    [
      "range over 60 weeks",
      { ...baseline, endDate: "2032-01-01" },
      "INVALID_EVENT_RECURRENCE",
    ],
    [
      "past replacement",
      {
        ...baseline,
        startDate: "2030-10-23",
        endDate: "2030-10-23",
        slots: [{ dayOfWeek: 3, startMinutes: 7 * 60, durationMinutes: 60 }],
      },
      "INVALID_EVENT_TIME",
    ],
  ] as const;
  for (const [name, schedule, error] of invalid) {
    await expect(
      admin.mutation(api.events.create, {
        schoolId: f.schoolId,
        ...details,
        schedule: { ...schedule, slots: [...schedule.slots] },
      }),
      name,
    ).rejects.toThrow(
      name === "past replacement" ? "EVENT_NO_FUTURE_SESSIONS" : error,
    );
    await expect(
      admin.mutation(api.events.updateDetails, {
        eventId,
        ...details,
        scheduleEdit: {
          mode: "replace",
          schedule: { ...schedule, slots: [...schedule.slots] },
          reason: "Change",
          expectedFutureCount: preview!.futureCount,
          expectedFutureFingerprint: preview!.futureFingerprint,
        },
      }),
      name,
    ).rejects.toThrow(error);
  }
  expect(await f.t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(
    1,
  );
  const rows = await f.t.run((ctx) =>
    ctx.db.query("eventOccurrences").collect(),
  );
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.status === "scheduled")).toBe(true);
});

test("a weekly range may use the exact 60-week limit and the full institution window", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 30));
  const f = await fixture();
  const startDate = "2030-10-24";
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      title: "Long weekly series",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "weekly",
        startDate,
        endDate: addCivilDays(startDate, 60 * 7),
        slots: [
          { dayOfWeek: 4, startMinutes: 7 * 60, durationMinutes: 11 * 60 },
        ],
      },
    });
  const rows = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(rows).toHaveLength(61);
  expect(
    rows.every(
      (row) => row.scheduledEnd - row.scheduledStart === 11 * 60 * 60_000,
    ),
  ).toBe(true);
});

test("new events reject elapsed single dates and weekly series without future dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2030, 9, 23, 14, 30));
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const details = {
    schoolId: f.schoolId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
  };
  await expect(
    admin.mutation(api.events.create, {
      ...details,
      schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
    }),
  ).rejects.toThrow("INVALID_EVENT_TIME");
  await expect(
    admin.mutation(api.events.create, {
      ...details,
      schedule: {
        kind: "weekly",
        startDate: "2030-10-23",
        endDate: "2030-10-23",
        slots: [{ dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 60 }],
      },
    }),
  ).rejects.toThrow("EVENT_NO_FUTURE_SESSIONS");
  expect(await f.t.run((ctx) => ctx.db.query("events").collect())).toEqual([]);
});

test("new weekly events schedule only future dates in the selected range", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2030, 9, 23, 14, 30));
  const f = await fixture();
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      title: "Assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "weekly",
        startDate: "2030-10-22",
        endDate: "2030-10-31",
        slots: [3, 4].map((dayOfWeek) => ({
          dayOfWeek,
          startMinutes: 9 * 60,
          durationMinutes: 60,
        })),
      },
    });
  const { event, occurrences } = await f.t.run(async (ctx) => ({
    event: (await ctx.db.get(eventId))!,
    occurrences: await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  }));
  expect(event.recurrenceStartDate).toBe("2030-10-22");
  expect(occurrences.map(({ scheduledStart }) => scheduledStart)).toEqual(
    ["2030-10-24", "2030-10-30", "2030-10-31"].map((date) =>
      localDateTimeToUtc(`${date}T09:00`, "America/Bogota"),
    ),
  );
});

test("elapsed DST-gap times do not block future weekly sessions", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2030, 2, 10, 12));
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.schoolId, {
      timeZone: "America/New_York",
      scheduleStartMinutes: 0,
      scheduleEndMinutes: 1440,
    }),
  );
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      title: "Assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "weekly",
        startDate: "2030-03-10",
        endDate: "2030-03-17",
        slots: [{ dayOfWeek: 0, startMinutes: 150, durationMinutes: 45 }],
      },
    });
  const dates = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(dates.map(({ scheduledStart }) => scheduledStart)).toEqual([
    localDateTimeToUtc("2030-03-17T02:30", "America/New_York"),
  ]);
});

test("invalid recurrence and times cannot write partial events", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.schoolId, {
      timeZone: "America/New_York",
      scheduleStartMinutes: 0,
      scheduleEndMinutes: 1440,
    }),
  );
  const base = {
    schoolId: f.schoolId,
    title: "Devotional",
    responsibleId: f.teacher,
    teacherIds: [],
  };
  await expect(
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      ...base,
      schedule: {
        kind: "weekly",
        startDate: "2030-03-01",
        endDate: "2030-03-31",
        slots: [{ dayOfWeek: 0, startMinutes: 150, durationMinutes: 45 }],
      },
    }),
  ).rejects.toThrow("INVALID_LOCAL_DATE_TIME");
  await expect(
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      ...base,
      schedule: {
        kind: "weekly",
        startDate: "2030-03-01",
        endDate: "2030-03-31",
        slots: [{ dayOfWeek: 0, startMinutes: 90, durationMinutes: 60 }],
      },
    }),
  ).rejects.toThrow("INVALID_LOCAL_DATE_TIME");
  await expect(
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      ...base,
      schedule: {
        kind: "weekly",
        startDate: "2030-10-23",
        endDate: "2030-10-23",
        slots: [{ dayOfWeek: 3, startMinutes: 1440, durationMinutes: 30 }],
      },
    }),
  ).rejects.toThrow("INVALID_EVENT_RECURRENCE");
  await expect(
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      ...base,
      schedule: { kind: "single", start: SINGLE_END, end: SINGLE_START },
    }),
  ).rejects.toThrow("INVALID_EVENT_TIME");
  expect(await f.t.run((ctx) => ctx.db.query("events").collect())).toEqual([]);
});

test("event calendar shows invited people even when there are no classes", async () => {
  const f = await fixture();
  const eventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      gradeCodes: ["05"],
      title: "Flag ceremony",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
    });
  const range = {
    schoolId: f.schoolId,
    campusId: f.campusId,
    scope: "campus" as const,
    from: SINGLE_START - 1,
    to: SINGLE_END,
    paginationOpts: { numItems: 10, cursor: null },
  };
  const admin = await f.t
    .withIdentity({ subject: "admin" })
    .query(api.events.listForCalendar, range);
  const student = await f.t
    .withIdentity({ subject: "student" })
    .query(api.events.listForCalendar, range);
  const otherStudent = await f.t
    .withIdentity({ subject: "otherStudent" })
    .query(api.events.listForCalendar, range);
  const otherGrade = await f.t
    .withIdentity({ subject: "admin" })
    .query(api.events.listForCalendar, { ...range, gradeCode: "06" });
  const teacherFilter = await f.t
    .withIdentity({ subject: "admin" })
    .query(api.events.listForCalendar, { ...range, teacherId: f.teacher });
  const otherTeacherFilter = await f.t
    .withIdentity({ subject: "admin" })
    .query(api.events.listForCalendar, { ...range, teacherId: f.otherTeacher });
  expect(admin.page.map((row) => row.eventId)).toEqual([eventId]);
  expect(student.page).toHaveLength(1);
  expect(otherStudent.page).toEqual([]);
  expect(otherGrade.page).toEqual([]);
  expect(teacherFilter.page).toHaveLength(1);
  expect(otherTeacherFilter.page).toEqual([]);
  const otherStudentList = await f.t
    .withIdentity({ subject: "otherStudent" })
    .query(api.events.list, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      now: SINGLE_START - 1,
      paginationOpts: { numItems: 10, cursor: null },
    });
  expect(otherStudentList.page).toEqual([]);
  expect(
    await f.t
      .withIdentity({ subject: "student" })
      .query(api.calendar.listEvents, {
        schoolId: range.schoolId,
        campusId: range.campusId,
        from: range.from,
        to: range.to,
      }),
  ).toEqual([]);
  const details = await f.t
    .withIdentity({ subject: "student" })
    .query(api.events.get, { eventId });
  expect(details?.title).toBe("Flag ceremony");
  expect(details?.canManage).toBe(false);
});

test("calendar pages campus and institution scopes, including older occurrences", async () => {
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const create = (
    title: string,
    campusId: typeof f.campusId | undefined,
    start: number,
  ) =>
    admin.mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId,
      title,
      responsibleId: campusId === f.otherCampusId ? f.otherTeacher : f.teacher,
      teacherIds: [],
      schedule: { kind: "single" as const, start, end: start + 60_000 },
    });
  const campusEvent = await create("Main", f.campusId, SINGLE_START);
  const olderCampusEvent = await create(
    "Older main",
    f.campusId,
    SINGLE_START + 60_000,
  );
  const otherCampusEvent = await create(
    "Second",
    f.otherCampusId,
    SINGLE_START + 120_000,
  );
  const institutionEvent = await create(
    "Institution",
    undefined,
    SINGLE_START + 180_000,
  );
  await f.t.run(async (ctx) => {
    for (const eventId of [olderCampusEvent, otherCampusEvent]) {
      const occurrence = await ctx.db
        .query("eventOccurrences")
        .withIndex("by_eventId_and_scheduledStart", (q) =>
          q.eq("eventId", eventId),
        )
        .first();
      await ctx.db.patch(occurrence!._id, { campusId: undefined });
    }
  });

  async function allPages(scope: "school" | "campus" | "institution") {
    const ids = [];
    let cursor: string | null = null;
    do {
      const page: {
        page: Array<{ eventId: typeof campusEvent }>;
        isDone: boolean;
        continueCursor: string;
      } = await admin.query(api.events.listForCalendar, {
        schoolId: f.schoolId,
        campusId: scope === "school" ? undefined : f.campusId,
        scope,
        from: SINGLE_START - 1,
        to: SINGLE_START + 240_000,
        paginationOpts: { numItems: 1, cursor },
      });
      ids.push(...page.page.map((row) => row.eventId));
      if (page.isDone) break;
      cursor = page.continueCursor;
    } while (true);
    return ids;
  }

  expect(await allPages("campus")).toEqual([campusEvent]);
  expect(await allPages("institution")).toEqual([
    olderCampusEvent,
    institutionEvent,
  ]);
  expect(await allPages("school")).toEqual([
    campusEvent,
    olderCampusEvent,
    otherCampusEvent,
    institutionEvent,
  ]);
});

test("other campuses cannot exhaust a campus calendar range", async () => {
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const mainEvent = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    title: "Main event",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const otherEvent = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.otherCampusId,
    title: "Other event",
    responsibleId: f.otherTeacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  for (let batch = 0; batch < 11; batch++) {
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 100; i++) {
        const start = SINGLE_START + (batch * 100 + i + 1) * 60_000;
        await ctx.db.insert("eventOccurrences", {
          eventId: otherEvent,
          schoolId: f.schoolId,
          campusId: f.otherCampusId,
          scheduledStart: start,
          scheduledEnd: start + 60_000,
          status: "scheduled",
          roomName: `other-${start}`,
          createdAt: 1,
          createdBy: f.admin,
        });
      }
    });
  }

  const range = {
    schoolId: f.schoolId,
    from: SINGLE_START - 1,
    to: SINGLE_START + 1_101 * 60_000,
    paginationOpts: { numItems: 10, cursor: null },
  };
  const campus = await admin.query(api.events.listForCalendar, {
    ...range,
    campusId: f.campusId,
    scope: "campus",
  });
  const school = await admin.query(api.events.listForCalendar, {
    ...range,
    scope: "school",
  });
  expect(campus.page.map((row) => row.eventId)).toEqual([mainEvent]);
  expect(school.page).toHaveLength(10);
  expect(school.isDone).toBe(false);
});

test("editing and cancelling an event date never changes an overlapping class", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 23));
  const f = await fixture();
  const ids = await f.t.run(async (ctx) => {
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Reference curriculum",
      schoolId: f.schoolId,
      isActive: true,
      createdAt: 1,
      createdBy: f.admin,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Reference class",
      curriculumId,
      schoolId: f.schoolId,
      campusId: f.campusId,
      gradeCode: "05",
      teacherId: f.teacher,
      isActive: true,
      createdAt: 1,
      createdBy: f.admin,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId: f.schoolId,
      scheduledStart: SINGLE_START,
      scheduledEnd: SINGLE_END,
      roomName: "reference-class",
      status: "scheduled",
      createdAt: 1,
      createdBy: f.admin,
    });
    return { scheduleId };
  });
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    title: "Exam briefing",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  const occurrence = (await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .first(),
  ))!;
  await admin.mutation(api.events.updateDetails, {
    eventId,
    campusId: f.campusId,
    title: "Exam briefing",
    responsibleId: f.teacher,
    teacherIds: [],
    scheduleEdit: {
      mode: "replace",
      schedule: {
        kind: "single",
        start: SINGLE_START + 30 * 60_000,
        end: SINGLE_END + 30 * 60_000,
      },
      reason: "Rescheduled",
      expectedFutureCount: 1,
      expectedFutureFingerprint: await expectedFutureFingerprint(f, eventId),
    },
  });
  const revised = (await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_status_and_scheduledStart", (q) =>
        q.eq("eventId", eventId).eq("status", "scheduled"),
      )
      .unique(),
  ))!;
  await admin.mutation(api.events.cancelOccurrence, {
    occurrenceId: revised._id,
    reason: "Rescheduled",
  });
  expect((await f.t.run((ctx) => ctx.db.get(ids.scheduleId)))?.status).toBe(
    "scheduled",
  );
  expect((await f.t.run((ctx) => ctx.db.get(occurrence._id)))?.status).toBe(
    "cancelled",
  );
  expect((await f.t.run((ctx) => ctx.db.get(revised._id)))?.status).toBe(
    "cancelled",
  );
  await expect(
    admin.mutation(api.events.cancelOccurrence, {
      occurrenceId: revised._id,
      reason: "Again",
    }),
  ).rejects.toThrow("EVENT_OCCURRENCE_NOT_EDITABLE");
  await expect(
    f.t
      .withIdentity({ subject: "otherAdmin" })
      .mutation(api.events.cancelOccurrence, {
        occurrenceId: occurrence._id,
        reason: "No",
      }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const survivingEventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    title: "Assembly",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: { kind: "single", start: SINGLE_START, end: SINGLE_END },
  });
  await admin.mutation(api.calendarClosures.create, {
    schoolId: f.schoolId,
    campusId: f.campusId,
    localDate: "2030-10-23",
    isAllDay: true,
    reason: "No classes",
    selectedPartialScheduleIds: [],
  });
  await vi.advanceTimersByTimeAsync(0);
  await f.t.finishInProgressScheduledFunctions();
  expect((await f.t.run((ctx) => ctx.db.get(ids.scheduleId)))?.status).toBe(
    "cancelled",
  );
  const survivingOccurrence = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", survivingEventId),
      )
      .first(),
  );
  expect(survivingOccurrence?.status).toBe("scheduled");
});

test("cancel future dates immediately keeps earlier occurrences and paginated history", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 23));
  const f = await fixture();
  const admin = f.t.withIdentity({ subject: "admin" });
  const eventId = await admin.mutation(api.events.create, {
    schoolId: f.schoolId,
    title: "Devotional",
    responsibleId: f.teacher,
    teacherIds: [],
    schedule: {
      kind: "weekly",
      startDate: "2030-10-23",
      endDate: "2030-11-13",
      slots: [{ dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 30 }],
    },
  });
  const page = await admin.query(api.events.listOccurrences, {
    eventId,
    category: "upcoming",
    now: Date.now(),
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(page.page).toHaveLength(2);
  expect(page.isDone).toBe(false);
  const second = await admin.query(api.events.listOccurrences, {
    eventId,
    category: "upcoming",
    now: Date.now(),
    paginationOpts: { numItems: 2, cursor: page.continueCursor },
  });
  expect(second.page).toHaveLength(2);
  const firstDate = page.page[0];
  await admin.mutation(api.events.cancelFuture, {
    occurrenceId: page.page[1]._id,
    reason: "Holiday",
  });
  const rows = await f.t.run((ctx) =>
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", eventId),
      )
      .collect(),
  );
  expect(rows.map((row) => row.status)).toEqual([
    "scheduled",
    "cancelled",
    "cancelled",
    "cancelled",
  ]);
  expect(firstDate.status).toBe("scheduled");
  const visibleUpcoming = await admin.query(api.events.listOccurrences, {
    eventId,
    category: "upcoming",
    now: Date.now(),
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(visibleUpcoming.page.map((row) => row._id)).toEqual([firstDate._id]);
  const cancelledPage = await admin.query(api.events.listOccurrences, {
    eventId,
    category: "cancelled",
    now: Date.now(),
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(cancelledPage.page).toHaveLength(2);
  const pastPage = await admin.query(api.events.listOccurrences, {
    eventId,
    category: "past",
    now: Date.UTC(2030, 10, 14),
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(pastPage.page.map((row) => row._id)).toEqual([firstDate._id]);
  expect(
    (
      await admin.query(api.events.nextOccurrence, {
        eventId,
        now: SINGLE_START - 1,
      })
    )?.status,
  ).toBe("scheduled");
});

test("deleting a campus removes its events and occurrences but keeps institutional events", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const create = (campusId?: typeof f.campusId, responsibleId = f.teacher) =>
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId,
      title: "Assembly",
      responsibleId,
      teacherIds: [],
      schedule: {
        kind: "single" as const,
        start: SINGLE_START,
        end: SINGLE_END,
      },
    });
  const campusEventId = await create(f.campusId);
  const recurringEventId = await f.t
    .withIdentity({ subject: "admin" })
    .mutation(api.events.create, {
      schoolId: f.schoolId,
      campusId: f.campusId,
      title: "Devotional",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "weekly",
        startDate: "2030-10-23",
        endDate: "2030-10-30",
        slots: [{ dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 30 }],
      },
    });
  const institutionalEventId = await create();
  const otherCampusEventId = await create(f.otherCampusId, f.otherTeacher);
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 205; i++) {
      await ctx.db.insert("eventOccurrences", {
        eventId: recurringEventId,
        schoolId: f.schoolId,
        scheduledStart: SINGLE_START + i * 60_000,
        scheduledEnd: SINGLE_END + i * 60_000,
        status: "completed",
        roomName: `historical-${i}`,
        createdAt: 1,
        createdBy: f.admin,
      });
    }
  });
  await f.t.mutation(internal.events.removeOccurrencesByEvent, {
    eventId: recurringEventId,
  });
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("eventOccurrences")
        .withIndex("by_eventId_and_scheduledStart", (q) =>
          q.eq("eventId", recurringEventId),
        )
        .collect(),
    ),
  ).toHaveLength(207);

  expect(
    await f.t.withIdentity({ subject: "admin" }).mutation(api.campuses.remove, {
      id: f.campusId,
    }),
  ).toEqual({ deleted: false, reason: "CAMPUS_IN_USE" });
  await f.t.run(async (ctx) => {
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_org", (q) =>
        q.eq("orgId", f.campusId).eq("orgType", "campus"),
      )
      .collect();
    for (const assignment of assignments) await ctx.db.delete(assignment._id);
  });
  expect(
    await f.t.withIdentity({ subject: "admin" }).mutation(api.campuses.remove, {
      id: f.campusId,
    }),
  ).toEqual({ deleted: true });
  expect(await f.t.run((ctx) => ctx.db.get(recurringEventId))).toBeNull();
  await f.t.mutation(internal.events.removeOccurrencesByEvent, {
    eventId: recurringEventId,
  });
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("eventOccurrences")
        .withIndex("by_eventId_and_scheduledStart", (q) =>
          q.eq("eventId", recurringEventId),
        )
        .collect(),
    ),
  ).toHaveLength(107);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const state = await f.t.run(async (ctx) => ({
    campus: await ctx.db.get(f.campusId),
    campusEvent: await ctx.db.get(campusEventId),
    recurringEvent: await ctx.db.get(recurringEventId),
    institutionalEvent: await ctx.db.get(institutionalEventId),
    otherCampusEvent: await ctx.db.get(otherCampusEventId),
    campusOccurrences: await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", campusEventId),
      )
      .collect(),
    recurringOccurrences: await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", recurringEventId),
      )
      .collect(),
  }));
  expect(state.campus).toBeNull();
  expect(state.campusEvent).toBeNull();
  expect(state.recurringEvent).toBeNull();
  expect(state.campusOccurrences).toEqual([]);
  expect(state.recurringOccurrences).toEqual([]);
  expect(state.institutionalEvent).not.toBeNull();
  expect(state.otherCampusEvent).not.toBeNull();
});

test("deleting a grade narrows shared events and removes exclusive events with occurrences", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const create = (gradeCodes?: string[]) =>
    f.t.withIdentity({ subject: "admin" }).mutation(api.events.create, {
      schoolId: f.schoolId,
      gradeCodes,
      title: "Assembly",
      responsibleId: f.teacher,
      teacherIds: [],
      schedule: {
        kind: "single" as const,
        start: SINGLE_START,
        end: SINGLE_END,
      },
    });
  const sharedEventId = await create(["05", "06"]);
  const exclusiveEventId = await create(["05"]);
  const wholeSchoolEventId = await create();
  const gradeId = await f.t.run(
    async (ctx) =>
      (
        await ctx.db
          .query("institutionGrades")
          .withIndex("by_school_and_code", (q) =>
            q.eq("schoolId", f.schoolId).eq("code", "05"),
          )
          .collect()
      ).find((grade) => grade.code === "05")!._id,
  );

  expect(
    await f.t.withIdentity({ subject: "admin" }).mutation(api.grades.remove, {
      id: gradeId,
    }),
  ).toEqual({ deleted: false });
  expect(
    (await f.t.run((ctx) => ctx.db.get(sharedEventId)))?.gradeCodes,
  ).toEqual(["05", "06"]);

  await f.t.run(async (ctx) => {
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_school_role_grade", (q) =>
        q
          .eq("schoolId", f.schoolId)
          .eq("role", "student")
          .eq("gradeCode", "05"),
      )
      .collect();
    for (const assignment of assignments) await ctx.db.delete(assignment._id);
  });
  expect(
    await f.t.withIdentity({ subject: "admin" }).mutation(api.grades.remove, {
      id: gradeId,
    }),
  ).toEqual({ deleted: true });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const state = await f.t.run(async (ctx) => ({
    grade: await ctx.db.get(gradeId),
    shared: await ctx.db.get(sharedEventId),
    exclusive: await ctx.db.get(exclusiveEventId),
    wholeSchool: await ctx.db.get(wholeSchoolEventId),
    exclusiveOccurrences: await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", exclusiveEventId),
      )
      .collect(),
  }));
  expect(state.grade).toBeNull();
  expect(state.shared?.gradeCodes).toEqual(["06"]);
  expect(state.exclusive).toBeNull();
  expect(state.exclusiveOccurrences).toEqual([]);
  expect(state.wholeSchool).not.toBeNull();

  const lastGradeId = await f.t.run(
    async (ctx) =>
      (await ctx.db
        .query("institutionGrades")
        .withIndex("by_school_and_code", (q) =>
          q.eq("schoolId", f.schoolId).eq("code", "06"),
        )
        .unique())!._id,
  );
  expect(
    await f.t.withIdentity({ subject: "admin" }).mutation(api.grades.remove, {
      id: lastGradeId,
    }),
  ).toEqual({ deleted: true });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.run((ctx) => ctx.db.get(sharedEventId))).toBeNull();
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("eventOccurrences")
        .withIndex("by_eventId_and_scheduledStart", (q) =>
          q.eq("eventId", sharedEventId),
        )
        .collect(),
    ),
  ).toEqual([]);
});
