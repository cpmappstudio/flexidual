import assert from "node:assert/strict";
import test from "node:test";
import {
  getCalendarEventAppearanceClasses,
  getCalendarProviderAppearanceClasses,
} from "../components/calendar/calendar-tailwind-classes";
import {
  getCalendarEventDisplay,
  getCalendarEventIndicators,
} from "../components/calendar/calendar-event-display";

const scheduledEvent = {
  color: "blue",
  status: "scheduled" as const,
  isPast: false,
};

test("future provider classes use their representative colors", () => {
  const ignitia = getCalendarEventAppearanceClasses({
    ...scheduledEvent,
    sessionType: "ignitia",
  });
  const abeka = getCalendarEventAppearanceClasses({
    ...scheduledEvent,
    sessionType: "abeka",
  });

  assert.match(ignitia.event, /F15A3D/);
  assert.match(abeka.event, /92278F/);
});

test("provider identity badges reuse the calendar brand colors", () => {
  const ignitia = getCalendarProviderAppearanceClasses("ignitia");
  const abeka = getCalendarProviderAppearanceClasses("abeka");

  assert.match(ignitia?.badge ?? "", /F15A3D/);
  assert.match(abeka?.badge ?? "", /92278F/);
  assert.equal(getCalendarProviderAppearanceClasses("live"), null);
});

test("FlexiDual classes retain the configured calendar color", () => {
  const appearance = getCalendarEventAppearanceClasses({
    ...scheduledEvent,
    sessionType: "live",
  });

  assert.match(appearance.event, /primary/);
});

test("past provider classes use a neutral background and keep a subtle brand border", () => {
  const ignitia = getCalendarEventAppearanceClasses({
    ...scheduledEvent,
    sessionType: "ignitia",
    isPast: true,
  });
  const abeka = getCalendarEventAppearanceClasses({
    ...scheduledEvent,
    sessionType: "abeka",
    isPast: true,
  });

  assert.match(ignitia.event, /border-\[#F15A3D\]\/50/);
  assert.match(abeka.event, /border-\[#92278F\]\/50/);
  assert.match(ignitia.event, /bg-neutral-status\/10/);
  assert.match(abeka.event, /bg-neutral-status\/10/);
  assert.equal(ignitia.text, "text-neutral-status");
  assert.equal(abeka.text, "text-neutral-status");
});

test("cancelled and active states retain status priority", () => {
  const cancelled = getCalendarEventAppearanceClasses({
    ...scheduledEvent,
    sessionType: "ignitia",
    status: "cancelled",
  });
  const active = getCalendarEventAppearanceClasses({
    ...scheduledEvent,
    sessionType: "abeka",
    status: "active",
  });

  assert.match(cancelled.event, /destructive/);
  assert.match(active.event, /success/);
});

test("external classes use the provider when no teacher is assigned", () => {
  const baseEvent = {
    className: "Provider class",
    curriculumTitle: "Provider curriculum",
    title: "Class session",
    gradeCode: "08",
  };

  const ignitia = getCalendarEventDisplay({
    ...baseEvent,
    sessionType: "ignitia",
  });
  const abeka = getCalendarEventDisplay({
    ...baseEvent,
    sessionType: "abeka",
    teacherName: "Unknown",
  });

  assert.equal(ignitia.secondaryLabel, "Ignitia");
  assert.equal(abeka.secondaryLabel, "Abeka");
});

test("an assigned teacher takes priority over the provider label", () => {
  const event = getCalendarEventDisplay({
    className: "Provider class",
    curriculumTitle: "Provider curriculum",
    title: "Class session",
    gradeCode: "08",
    sessionType: "ignitia",
    teacherName: "Professor Betancourt",
  });

  assert.equal(event.secondaryLabel, "Professor Betancourt");
});

test("recordings replace the provider identity on past classes", () => {
  assert.deepEqual(
    getCalendarEventIndicators({ hasRecording: true, isLive: false }, true),
    { showRecording: true, showProviderIdentity: false },
  );
});

test("provider identity remains visible when no recording is shown", () => {
  assert.deepEqual(
    getCalendarEventIndicators({ hasRecording: true, isLive: false }, false),
    { showRecording: false, showProviderIdentity: true },
  );
});
