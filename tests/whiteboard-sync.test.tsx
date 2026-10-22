import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWhiteboardSync } from "@/lib/whiteboard-sync";
import {
  mergeWhiteboardElements,
  isolateWhiteboardElements,
  type WhiteboardElement,
} from "@/lib/whiteboard-elements";

const element = (version = 1, id = "drawing"): WhiteboardElement => ({
  id,
  version,
  versionNonce: version,
  isDeleted: false,
  index: "a0",
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
    async () => {},
  ),
) {
  const saved = vi.fn();
  const error = vi.fn();
  return {
    sync: createWhiteboardSync({ send, saved, error }),
    send,
    saved,
    error,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it("delivers continuous edits before the writer pauses instead of resetting a debounce", async () => {
  const { sync, send } = setup();
  for (let elapsed = 0; elapsed < 1000; elapsed += 16) {
    sync.update([element(elapsed + 1)]);
    await vi.advanceTimersByTimeAsync(16);
    if (elapsed >= 80) expect(send).toHaveBeenCalled();
  }
  expect(send.mock.calls.length).toBeGreaterThan(5);
  expect(send.mock.calls.length).toBeLessThanOrEqual(13);
  sync.dispose();
  await vi.advanceTimersByTimeAsync(0);
});

it("sends just the changed element in a thousand-element scene and includes ordering changes", async () => {
  const { sync, send } = setup();
  const scene = Array.from({ length: 1000 }, (_, i) =>
    element(1, `drawing-${i}`),
  );
  sync.seed(scene);
  const changed = { ...scene[543], version: 2, index: "b0" };
  sync.update(scene.map((item, i) => (i === 543 ? changed : item)));
  await vi.advanceTimersByTimeAsync(80);
  expect(send).toHaveBeenCalledExactlyOnceWith([changed]);
  sync.dispose();
});

it("keeps one request in flight and coalesces later edits into the newest revision", async () => {
  const first = deferred();
  const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
    async () => {},
  );
  send.mockImplementationOnce(() => first.promise);
  const { sync, saved } = setup(send);
  sync.update([element()]);
  await vi.advanceTimersByTimeAsync(80);
  sync.update([element(2)]);
  sync.update([element(3)]);
  await vi.advanceTimersByTimeAsync(500);
  expect(send).toHaveBeenCalledTimes(1);
  first.resolve();
  await vi.advanceTimersByTimeAsync(80);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0]).toEqual([element(3)]);
  expect(saved).toHaveBeenCalledExactlyOnceWith([element(3)]);
  sync.dispose();
});

it("changes cadence without replacing pending writes or their acknowledgements", async () => {
  const first = deferred();
  let interval = 80;
  const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
    async () => {},
  );
  send.mockImplementationOnce(() => first.promise);
  const saved = vi.fn();
  const sync = createWhiteboardSync({
    send,
    saved,
    error: vi.fn(),
    interval: () => interval,
  });
  sync.update([element()]);
  await vi.advanceTimersByTimeAsync(80);
  interval = 750;
  sync.update([element(2)]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(saved).not.toHaveBeenCalled();
  first.resolve();
  await vi.advanceTimersByTimeAsync(749);
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(send).toHaveBeenLastCalledWith([element(2)]);
  expect(saved).toHaveBeenCalledExactlyOnceWith([element(2)]);
  interval = 80;
  sync.update([element(3)]);
  await vi.advanceTimersByTimeAsync(80);
  expect(send).toHaveBeenCalledTimes(3);
  sync.dispose();
});

it.each([33, 750])(
  "drains an explicit flush behind an in-flight send without another %i ms window",
  async (interval) => {
    const first = deferred();
    const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
      async () => {},
    );
    send.mockImplementationOnce(() => first.promise);
    const saved = vi.fn();
    const sync = createWhiteboardSync({
      send,
      saved,
      error: vi.fn(),
      interval,
    });
    sync.update([element()]);
    await vi.advanceTimersByTimeAsync(interval);
    sync.update([element(2)]);
    await sync.flush();
    sync.update([element(3)]);
    await sync.flush();
    expect(send).toHaveBeenCalledTimes(1);
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith([element(3)]);
    expect(saved).toHaveBeenCalledExactlyOnceWith([element(3)]);
    sync.dispose();
  },
);

it.each(["offline", "PERMISSION_DENIED"])(
  "queued flush does not bypass failure policy: %s",
  async (message) => {
    let reject!: (error: Error) => void;
    const first = new Promise<void>((_, fail) => {
      reject = fail;
    });
    const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
      async () => {},
    );
    send.mockImplementationOnce(() => first);
    const { sync, error } = setup(send);
    sync.update([element()]);
    await vi.advanceTimersByTimeAsync(80);
    sync.update([element(2)]);
    await sync.flush();
    reject(new Error(message));
    await vi.advanceTimersByTimeAsync(999);
    expect(error).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(message === "offline" ? 2 : 1);
    if (message === "offline")
      expect(send).toHaveBeenLastCalledWith([element(2)]);
    // Dispose intentionally requests a final send; keep the permanent-failure
    // assertion above separate from that existing lifecycle behavior.
    sync.dispose();
  },
);

it("confirms the current scene when remote edits arrive before the local acknowledgement", async () => {
  const request = deferred();
  const { sync, send, saved } = setup(vi.fn(() => request.promise));
  const local = element(1, "local");
  const remote = element(1, "remote");
  sync.update([local]);
  await vi.advanceTimersByTimeAsync(80);
  sync.seed([local, remote]);
  sync.update([local, remote]);
  expect(sync.hasPending()).toBe(true);
  request.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(saved).toHaveBeenCalledExactlyOnceWith([local, remote]);
  expect(sync.hasPending()).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
  sync.dispose();
});

it("automatically retries a transient offline failure without another drawing event", async () => {
  const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
    async () => {},
  );
  send.mockRejectedValueOnce(new Error("Network disconnected"));
  const { sync, saved, error } = setup(send);
  sync.update([element()]);
  await vi.advanceTimersByTimeAsync(80);
  expect(error).toHaveBeenCalledTimes(1);
  expect(saved).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(999);
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(send).toHaveBeenCalledTimes(2);
  expect(saved).toHaveBeenCalledExactlyOnceWith([element()]);
  sync.dispose();
});

it("keeps tombstones through clear and restores a higher-version undo without resurrecting delayed edits", async () => {
  let durable = [element()];
  const send = vi.fn(async (changes: WhiteboardElement[]) => {
    durable = mergeWhiteboardElements(durable, changes);
  });
  const { sync } = setup(send);
  sync.seed(durable);
  sync.update([]);
  await vi.advanceTimersByTimeAsync(80);
  expect(durable).toEqual([
    { ...element(2), versionNonce: 1, isDeleted: true },
  ]);
  durable = mergeWhiteboardElements(durable, [element()]);
  expect(durable[0].isDeleted).toBe(true);
  sync.update([element(3)]);
  await vi.advanceTimersByTimeAsync(80);
  expect(durable).toEqual([element(3)]);
  sync.dispose();
});

it("does not confirm the latest draft when an older request finishes, including mutated editor objects", async () => {
  const first = deferred();
  const second = deferred();
  const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
    async () => {},
  );
  send
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  const { sync, saved } = setup(send);
  const drawing = element();
  sync.update([drawing]);
  await vi.advanceTimersByTimeAsync(80);
  Object.assign(drawing, element(2));
  sync.update([drawing]);
  expect(send.mock.calls[0][0]).toEqual([element()]);
  first.resolve();
  await vi.advanceTimersByTimeAsync(80);
  expect(saved).not.toHaveBeenCalled();
  second.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(saved).toHaveBeenCalledExactlyOnceWith([element(2)]);
  sync.dispose();
});

it("flushes the final pending edit on dispose, including one queued behind a request", async () => {
  const first = deferred();
  const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
    async () => {},
  );
  send.mockImplementationOnce(() => first.promise);
  const { sync, saved } = setup(send);
  sync.update([element()]);
  await vi.advanceTimersByTimeAsync(80);
  expect(send).toHaveBeenCalledExactlyOnceWith([element()]);
  sync.update([element(2)]);
  sync.dispose();
  first.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0]).toEqual([element(2)]);
  expect(saved).toHaveBeenCalledExactlyOnceWith([element(2)]);
});

it.each(["STALE_LIVE_ACTIVATION", "STALE_WHITEBOARD_GENERATION"])(
  "does not automatically replay writes rejected by %s",
  async (failure) => {
    const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
      async () => {
        throw new Error(failure);
      },
    );
    const { sync, error, saved } = setup(send);
    sync.update([element()]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
  },
);

it("resumes after effect cleanup and reports in-flight work as pending", async () => {
  const request = deferred();
  const send = vi.fn<(elements: WhiteboardElement[]) => Promise<void>>(
    async () => {},
  );
  send.mockImplementationOnce(() => request.promise);
  const { sync } = setup(send);
  sync.dispose();
  sync.resume();
  expect(sync.hasPending()).toBe(false);
  sync.update([element()]);
  expect(sync.hasPending()).toBe(true);
  await vi.advanceTimersByTimeAsync(80);
  expect(sync.hasPending()).toBe(true);
  request.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(sync.hasPending()).toBe(false);
  sync.dispose();
});

it.each([false, true])(
  "retains missing-element tombstones before the first flush, clear first=%s",
  async (clearFirst) => {
    let durable = [element(1, "old")];
    const send = vi.fn(async (changes: WhiteboardElement[]) => {
      durable = mergeWhiteboardElements(durable, changes);
    });
    const { sync } = setup(send);
    sync.seed(durable);
    if (clearFirst) sync.update([]);
    sync.update([element(1, "new")]);
    await vi.advanceTimersByTimeAsync(80);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "old", version: 2, isDeleted: true }),
        element(1, "new"),
      ]),
    );
    expect(durable.filter((item) => !item.isDeleted)).toEqual([
      element(1, "new"),
    ]);
    sync.dispose();
  },
);

it("isolates nested remote drawing data and clones only changed element revisions", () => {
  const source = Array.from({ length: 1000 }, (_, i) => ({
    ...element(1, `drawing-${i}`),
    points: [
      [0, 0],
      [1, 1],
    ],
  }));
  const local = isolateWhiteboardElements(source);
  expect(local[0]).not.toBe(source[0]);
  const nextSource = source.map((item, i) =>
    i === 543 ? { ...item, version: 2, versionNonce: 2 } : item,
  );
  const clone = vi.spyOn(globalThis, "structuredClone");
  const nextLocal = isolateWhiteboardElements(nextSource, local);
  expect(clone).toHaveBeenCalledTimes(1);
  expect(nextLocal[0]).toBe(local[0]);
  expect(nextLocal[543]).not.toBe(nextSource[543]);
  nextLocal[543].points[0][0] = 42;
  expect(nextSource[543].points[0][0]).toBe(0);
  clone.mockRestore();
});

it("an update in another bucket cannot acknowledge a local edit through a mutated cached reference", async () => {
  const canonical = [
    {
      ...element(1, "one"),
      points: [
        [0, 0],
        [1, 1],
      ],
    },
  ];
  const editor = isolateWhiteboardElements(canonical);
  const { sync, send } = setup();
  sync.seed(canonical);
  Object.assign(editor[0], { version: 2, versionNonce: 2 });
  editor[0].points[0][0] = 42;
  sync.update(editor);
  const anotherBucket = [
    ...canonical,
    { ...element(1, "two"), points: [[2, 2]] },
  ];
  const nextEditor = mergeWhiteboardElements(
    editor,
    isolateWhiteboardElements(anotherBucket, editor),
  );
  sync.seed(anotherBucket);
  sync.update(nextEditor);
  await vi.advanceTimersByTimeAsync(80);
  expect(canonical[0]).toMatchObject({
    version: 1,
    points: [
      [0, 0],
      [1, 1],
    ],
  });
  expect(send).toHaveBeenCalledExactlyOnceWith([
    expect.objectContaining({
      id: "one",
      version: 2,
      points: [
        [42, 0],
        [1, 1],
      ],
    }),
  ]);
  sync.dispose();
});
