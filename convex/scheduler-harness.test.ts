import { convexTest } from "convex-test";
import { actionGeneric, makeFunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.useRealTimers());

test("the test scheduler cancels its timer pump when teardown replaces the fake clock", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const t = convexTest(schema, {
    ...modules,
    "./schedulerProbe.ts": async () => ({
      wait: actionGeneric({
        args: {},
        handler: async () => {
          started();
          await gate;
          return null;
        },
      }),
    }),
  });
  await t.run((ctx) =>
    ctx.scheduler.runAfter(
      0,
      makeFunctionReference<"action">("schedulerProbe:wait"),
      {},
    ),
  );
  const finishing = t.finishAllScheduledFunctions(() =>
    vi.advanceTimersByTime(1_000),
  );
  try {
    await entered;
    const rejected = expect(finishing).rejects.toThrow(
      "timers were restored or replaced",
    );
    vi.useRealTimers();
    await rejected;
  } finally {
    release();
    await t.finishInProgressScheduledFunctions();
    // Always observe failures even if an assertion above throws.
    await finishing.catch(() => {});
  }
});
