import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("connect-device authentication audit", () => {
  test("the tolerant current-user query returns null without auth", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.users.getCurrentUser, {})).resolves.toBeNull();
  });

  test("getStaffContext throws the reported error without an auth identity", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.organizations.getStaffContext, { orgSlug: "school" }),
    ).rejects.toThrow("User not authenticated");
  });

  test("getStaffContext reports the same error when Clerk has no Convex user", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t
        .withIdentity({ subject: "missing-user" })
        .query(api.organizations.getStaffContext, { orgSlug: "school" }),
    ).rejects.toThrow("User not authenticated");
  });

  test("getStaffContext reports the same error for an inactive Convex user", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "inactive-user",
        firstName: "Inactive",
        lastName: "Teacher",
        fullName: "Inactive Teacher",
        isActive: false,
        createdAt: Date.now(),
      }),
    );

    await expect(
      t
        .withIdentity({ subject: "inactive-user" })
        .query(api.organizations.getStaffContext, { orgSlug: "school" }),
    ).rejects.toThrow("User not authenticated");
  });

  test("an active synchronized user without access returns null instead of throwing", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "active-user",
        firstName: "Active",
        lastName: "Teacher",
        fullName: "Active Teacher",
        isActive: true,
        createdAt: Date.now(),
      }),
    );

    await expect(
      t
        .withIdentity({ subject: "active-user" })
        .query(api.organizations.getStaffContext, { orgSlug: "missing-org" }),
    ).resolves.toBeNull();
  });

  test("the server route lookup throws before resolving a classroom without auth", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.schedule.getByRoomName, { roomName: "room" }),
    ).rejects.toThrow("User not authenticated");
  });

  test("the client session lookup throws before resolving a classroom without auth", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.schedule.getSessionStatus, {
        sessionId: "room",
        now: Date.now(),
      }),
    ).rejects.toThrow("User not authenticated");
  });
});
