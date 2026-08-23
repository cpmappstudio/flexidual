import assert from "node:assert/strict";
import test from "node:test";
import { getSystemNotificationHref } from "../lib/system-notification-navigation";

test("routes class notifications to their contextual destinations", () => {
  assert.equal(
    getSystemNotificationHref({
      kind: "class_starting_soon",
      organizationSlug: "main-campus",
      roomName: "science room",
    }),
    "/main-campus/classroom/science%20room",
  );
  assert.equal(
    getSystemNotificationHref({
      kind: "class_cancelled",
      organizationSlug: "main-campus",
    }),
    "/main-campus/calendar",
  );
  assert.equal(
    getSystemNotificationHref({
      kind: "recording_available",
      organizationSlug: "main-campus",
      classId: "class-id" as never,
    }),
    "/main-campus/classes/class-id",
  );
});

test("removed memberships do not navigate to inaccessible organizations", () => {
  assert.equal(
    getSystemNotificationHref({
      kind: "organization_membership_changed",
      action: "removed",
      organizationSlug: "former-campus",
    }),
    null,
  );
});

test("removed course access does not navigate to an inaccessible course", () => {
  assert.equal(
    getSystemNotificationHref({
      kind: "course_enrollment",
      action: "removed",
      organizationSlug: "former-campus",
      classId: "class-id" as never,
    }),
    null,
  );
});
