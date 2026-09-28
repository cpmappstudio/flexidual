import assert from "node:assert/strict";
import test from "node:test";
import {
  isNotificationInFeed,
  READ_NOTIFICATION_RETENTION_MS as week,
} from "../lib/notification-retention";

test("hides read notifications after seven days, never unread ones", () => {
  assert.equal(isNotificationInFeed({}, 100 * week), true);
  assert.equal(isNotificationInFeed({ readAt: 100 }, 100 + week - 1), true);
  assert.equal(isNotificationInFeed({ readAt: 100 }, 100 + week), false);
  assert.equal(isNotificationInFeed({ readAt: undefined }, 100 + week), true);
});
