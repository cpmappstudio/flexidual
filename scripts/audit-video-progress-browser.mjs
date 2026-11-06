// Real Chrome/IndexedDB check; no application backend, accounts or existing data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const bundle = await build({
  stdin: {
    contents:
      'export { updatePendingVideoProgress, readVideoPlayback, updateVideoPlayback } from "./lib/video-progress-storage.ts"; export { addPlayedRange, coverageSize, mergeCoverage, subtractCoverage, watchedMilliseconds } from "./lib/video-progress.ts"; export { startVideoProgress } from "./lib/video-progress-session.ts"; export { ConvexError } from "convex/values";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "ProgressAudit",
  platform: "browser",
});
const server = createServer((request, response) => {
  response.setHeader(
    "Content-Type",
    request.url === "/audit.js" ? "application/javascript" : "text/html",
  );
  response.end(
    request.url === "/audit.js"
      ? bundle.outputFiles[0].contents
      : '<!doctype html><title>Video progress storage audit</title><script src="/audit.js"></script>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const legacyPage = await context.newPage();
  await legacyPage.goto(`http://127.0.0.1:${server.address().port}`);
  // Keep an actual old connection open while the new client writes bookmarks.
  await legacyPage.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("flexidual-video-progress", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("pending");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        window.legacyDb = request.result;
        window.legacyVersionChanged = false;
        request.result.onversionchange = () => {
          window.legacyVersionChanged = true;
          request.result.close();
        };
        const transaction = request.result.transaction("pending", "readwrite");
        transaction
          .objectStore("pending")
          .put(new Uint8Array([16]).buffer, "pre-upgrade");
        transaction.oncomplete = () => {
          resolve();
        };
      };
    });
  });
  const playbackStorage = await page.evaluate(async () => {
    const {
      updateVideoPlayback: update,
      readVideoPlayback: read,
      updatePendingVideoProgress,
    } = ProgressAudit;
    const base = { durationMs: 120_000, positionMs: 50_250, updatedAt: 200 };
    await Promise.all([
      update("navigation:user-a:video", {
        ...base,
        coverage: new Uint8Array([1]).buffer,
      }),
      update("navigation:user-a:video", {
        ...base,
        positionMs: 10_000,
        updatedAt: 100,
        coverage: new Uint8Array([2]).buffer,
      }),
    ]);
    await update("navigation:user-a:video", {
      ...base,
      durationMs: 119_900,
      positionMs: 0,
      updatedAt: 0,
      coverage: new Uint8Array([8]).buffer,
    });
    const stored = await read("navigation:user-a:video");
    return {
      positionMs: stored.positionMs,
      coverage: [...new Uint8Array(stored.coverage)],
      other: await read("navigation:user-b:video"),
      pending: [...(await updatePendingVideoProgress("pre-upgrade"))],
    };
  });
  assert.deepEqual(playbackStorage, {
    positionMs: 50_250,
    coverage: [3],
    other: undefined,
    pending: [16],
  });
  const legacyCompatibility = await legacyPage.evaluate(async () => {
    const changed = window.legacyVersionChanged;
    window.legacyDb.close();
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open("flexidual-video-progress", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("pending", "readwrite");
        const store = transaction.objectStore("pending");
        const existing = store.get("pre-upgrade");
        existing.onsuccess = () => {
          const value = new Uint8Array(existing.result);
          value[0] |= 2;
          store.put(value.buffer, "pre-upgrade");
        };
        transaction.oncomplete = () => {
          db.close();
          resolve({ changed, version: db.version });
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  assert.deepEqual(legacyCompatibility, { changed: false, version: 1 });
  assert.deepEqual(
    await page.evaluate(async () => [
      ...(await ProgressAudit.updatePendingVideoProgress("pre-upgrade")),
    ]),
    [18],
  );
  await legacyPage.close();

  // Existing browsers that ran the earlier v2 code keep their bookmarks and outbox.
  const v2Context = await browser.newContext();
  try {
    const v2Page = await v2Context.newPage();
    await v2Page.goto(`http://127.0.0.1:${server.address().port}`);
    const legacyV2 = await v2Page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("flexidual-video-progress", 2);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("pending");
          request.result.createObjectStore("playback");
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(
            ["pending", "playback"],
            "readwrite",
          );
          transaction
            .objectStore("pending")
            .put(new Uint8Array([8]).buffer, "v2-user");
          transaction.objectStore("playback").put(
            {
              coverage: new Uint8Array([3]).buffer,
              durationMs: 120_000,
              positionMs: 40_250,
              updatedAt: 300,
            },
            "v2-user",
          );
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
      const original = await ProgressAudit.readVideoPlayback("v2-user");
      await ProgressAudit.updateVideoPlayback("v2-user", {
        ...original,
        positionMs: 45_500,
        updatedAt: 400,
      });
      const next = await ProgressAudit.readVideoPlayback("v2-user");
      return {
        before: original.positionMs,
        after: next.positionMs,
        coverage: [...new Uint8Array(next.coverage)],
        pending: [
          ...(await ProgressAudit.updatePendingVideoProgress("v2-user")),
        ],
      };
    });
    assert.deepEqual(legacyV2, {
      before: 40_250,
      after: 45_500,
      coverage: [3],
      pending: [8],
    });
  } finally {
    await v2Context.close();
  }
  const lateClose = await page.evaluate(async () => {
    const makeVideo = () => {
      const video = document.createElement("video");
      Object.defineProperties(video, {
        duration: { get: () => 120 },
        paused: { get: () => true },
        played: { get: () => ({ length: 0 }) },
      });
      return video;
    };
    const coverage = new Uint8Array(ProgressAudit.coverageSize(120_000));
    ProgressAudit.addPlayedRange(coverage, 0, 80_000, 120_000);
    const target = {
      id: "late-progress",
      durationMs: 120_000,
      coverage: coverage.buffer,
    };
    let complete;
    const preparation = new Promise((resolve) => {
      complete = resolve;
    });
    let writes = 0;
    const save = async (_id, coverage) => {
      writes++;
      return { coverage };
    };
    const options = { storageKey: "late-close", save, onPending: () => {} };
    const close = ProgressAudit.startVideoProgress(makeVideo(), {
      ...options,
      prepare: () => preparation,
    });
    close();
    complete(target);
    let snapshot;
    for (let i = 0; i < 100; i++) {
      snapshot = await ProgressAudit.readVideoPlayback("late-close");
      if (
        snapshot &&
        ProgressAudit.watchedMilliseconds(
          new Uint8Array(snapshot.coverage),
          120_000,
        ) === 80_000
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const reopened = makeVideo();
    let restored;
    const ready = new Promise((resolve) => {
      restored = resolve;
    });
    const closeReopened = ProgressAudit.startVideoProgress(reopened, {
      ...options,
      prepare: async () => target,
      onReady: restored,
    });
    await ready;
    const result = {
      bookmarkTimestamp: snapshot.updatedAt,
      resumedAt: reopened.currentTime,
      writes,
    };
    closeReopened();
    return result;
  });
  assert.deepEqual(lateClose, {
    bookmarkTimestamp: 0,
    resumedAt: 80,
    writes: 0,
  });
  const pending = await page.evaluate(async () => {
    const { updatePendingVideoProgress: update } = ProgressAudit;
    await Promise.all([
      update("learner:video", new Uint8Array([1])),
      update("learner:video", new Uint8Array([2])),
    ]);
    const before = [...(await update("learner:video"))];
    const after = [
      ...(await update(
        "learner:video",
        new Uint8Array([4]),
        new Uint8Array([1]),
      )),
    ];
    await update("other-learner:video", new Uint8Array([8]));
    return { before, after };
  });
  assert.deepEqual(pending, { before: [3], after: [6] });
  await page.reload();
  const recovered = await page.evaluate(async () => {
    const update = ProgressAudit.updatePendingVideoProgress;
    const values = {
      learner: [...(await update("learner:video"))],
      other: [...(await update("other-learner:video"))],
    };
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
    let quota = false;
    try {
      await update("learner:video", new Uint8Array([16]));
    } catch (error) {
      quota = error.name === "QuotaExceededError";
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
    const stillPending = [...(await update("learner:video"))];
    await update("learner:video", new Uint8Array(), new Uint8Array([255]));
    return {
      ...values,
      quota,
      stillPending,
      cleared: [...(await update("learner:video"))],
    };
  });
  assert.deepEqual(recovered, {
    learner: [6],
    other: [8],
    quota: true,
    stillPending: [6],
    cleared: [],
  });

  const migration = await page.evaluate(async () => {
    const update = ProgressAudit.updatePendingVideoProgress;
    await update("legacy-id", new Uint8Array([1]));
    await update("stable-key", new Uint8Array([2]));
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
    try {
      await update(
        "stable-key",
        new Uint8Array([4]),
        new Uint8Array(),
        "legacy-id",
      );
    } catch {
      /* An interrupted migration must preserve both original entries. */
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
    const before = [
      [...(await update("legacy-id"))],
      [...(await update("stable-key"))],
    ];
    const merged = [
      ...(await update(
        "stable-key",
        new Uint8Array([4]),
        new Uint8Array([1]),
        "legacy-id",
      )),
    ];
    return { before, merged, old: [...(await update("legacy-id"))] };
  });
  assert.deepEqual(migration, { before: [[1], [2]], merged: [6], old: [] });

  const offline = await page.evaluate(async () => {
    const video = document.createElement("video");
    let end = 0;
    Object.defineProperties(video, {
      duration: { get: () => 120 },
      paused: { get: () => false },
      played: { get: () => ({ length: 1, start: () => 0, end: () => end }) },
    });
    let writes = 0;
    const stop = ProgressAudit.startVideoProgress(video, {
      storageKey: "backend:user-a:video",
      prepare: async () => {
        throw new Error("Offline before receiving a progress ID");
      },
      save: async (_id, coverage) => {
        writes++;
        return { coverage };
      },
      onPending: () => {},
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    end = 20;
    video.currentTime = end;
    video.dispatchEvent(new Event("timeupdate"));
    stop();
    let watchedMs = 0;
    for (let i = 0; i < 50; i++) {
      const pending = await ProgressAudit.updatePendingVideoProgress(
        "backend:user-a:video",
      );
      watchedMs = ProgressAudit.watchedMilliseconds(pending, 120_000);
      if (watchedMs === 20_000) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return { writes, watchedMs };
  });
  assert.deepEqual(offline, { writes: 0, watchedMs: 20_000 });
  await page.reload();
  const replay = await page.evaluate(async () => {
    const writes = [];
    const video = document.createElement("video");
    Object.defineProperties(video, {
      duration: { get: () => 120 },
      paused: { get: () => true },
      played: { get: () => ({ length: 0 }) },
    });
    const options = {
      prepare: async () => ({
        id: "server-progress-id",
        durationMs: 120_000,
        coverage: new ArrayBuffer(15),
      }),
      save: async (_id, coverage) => {
        writes.push(
          ProgressAudit.watchedMilliseconds(new Uint8Array(coverage), 120_000),
        );
        return { coverage };
      },
      onPending: () => {},
    };
    const other = ProgressAudit.startVideoProgress(video, {
      ...options,
      storageKey: "backend:user-b:video",
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    other();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const otherWrites = writes.length;
    const stop = ProgressAudit.startVideoProgress(video, {
      ...options,
      storageKey: "backend:user-a:video",
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    stop();
    for (let i = 0; i < 50 && !writes.length; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    const pending = await ProgressAudit.updatePendingVideoProgress(
      "backend:user-a:video",
    );
    return { otherWrites, writes, pending: [...pending].some(Boolean) };
  });
  assert.deepEqual(replay, {
    otherWrites: 0,
    writes: [20_000],
    pending: false,
  });
  const nativePlayback = await page.evaluate(async () => {
    async function playScenario(
      nativeMs,
      durationMs,
      key,
      legacy = false,
      navigation = false,
    ) {
      // A short PCM fixture gives Chrome real native played/ended events without
      // fetching media or creating application records. The tracking API is shared
      // by audio/video HTMLMediaElements.
      const samples = (nativeMs / 1000) * 8000;
      const wav = new ArrayBuffer(44 + samples * 2);
      const view = new DataView(wav);
      const text = (offset, value) => {
        for (let i = 0; i < value.length; i++)
          view.setUint8(offset + i, value.charCodeAt(i));
      };
      text(0, "RIFF");
      view.setUint32(4, wav.byteLength - 8, true);
      text(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true);
      view.setUint32(28, 16000, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      text(36, "data");
      view.setUint32(40, samples * 2, true);
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      let server = new Uint8Array([legacy ? 31 : 0]);
      let writes = 0;
      const starts = [];
      const episodes = [];
      const seeks = [];
      const settle = () => new Promise((done) => setTimeout(done, 30));
      const original = IDBDatabase.prototype.transaction;
      if (legacy)
        IDBDatabase.prototype.transaction = function () {
          throw new DOMException("Storage full", "QuotaExceededError");
        };
      try {
        for (const end of legacy
          ? [null]
          : navigation
            ? [1.25, null]
            : [1.25, 4.6, null]) {
          const video = document.createElement("video");
          video.muted = true;
          document.body.append(video);
          const metadata = new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = reject;
          });
          video.src = url;
          await metadata;
          const stop = ProgressAudit.startVideoProgress(video, {
            storageKey: key,
            prepare: async () => ({
              id: "native-progress",
              durationMs,
              coverage: server.slice().buffer,
            }),
            save: async (_id, coverage) => {
              writes++;
              server = ProgressAudit.mergeCoverage(
                server,
                new Uint8Array(coverage),
              );
              return { coverage: server.slice().buffer };
            },
            onPending: () => {},
          });
          await settle();
          starts.push(video.currentTime);
          await video.play();
          await new Promise((resolve) => {
            if (end === null)
              video.addEventListener("ended", resolve, { once: true });
            else {
              const timer = setInterval(() => {
                if (video.currentTime >= end) {
                  clearInterval(timer);
                  video.pause();
                  resolve();
                }
              }, 10);
            }
          });
          await settle();
          if (navigation && end !== null) {
            const seek = async (time) => {
              const done = new Promise((resolve) =>
                video.addEventListener("seeked", resolve, { once: true }),
              );
              video.currentTime = time;
              await done;
              await settle();
              seeks.push(video.currentTime);
            };
            await seek(4); // Not watched: native seek must be corrected to the first missing cell.
            await seek(0.5); // Rewind remains unrestricted and is the next bookmark.
          }
          stop();
          await settle();
          episodes.push({
            time: video.currentTime,
            ranges: Array.from({ length: video.played.length }, (_, i) => [
              video.played.start(i),
              video.played.end(i),
            ]),
            watchedMs: ProgressAudit.watchedMilliseconds(server, durationMs),
          });
          video.removeAttribute("src");
          video.load();
          video.remove();
        }
        return {
          starts,
          writes,
          episodes,
          seeks,
          watchedMs: ProgressAudit.watchedMilliseconds(server, durationMs),
        };
      } finally {
        IDBDatabase.prototype.transaction = original;
        URL.revokeObjectURL(url);
      }
    }
    return {
      same: await playScenario(5879, 5879, "native-reopenings"),
      shorter: await playScenario(5000, 5879, "native-shorter"),
      longer: await playScenario(5879, 5000, "native-longer"),
      legacyQuota: await playScenario(5000, 5879, "native-legacy-quota", true),
      navigation: await playScenario(
        5879,
        5879,
        "native-navigation",
        false,
        true,
      ),
    };
  });
  for (const [name, durationMs] of [
    ["same", 5879],
    ["shorter", 5879],
    ["longer", 5000],
  ]) {
    const actual = nativePlayback[name];
    assert.deepEqual(actual.starts, [0, 1, 4], JSON.stringify(actual));
    assert.equal(actual.watchedMs, durationMs);
    assert.equal(actual.writes, 3);
  }
  assert.deepEqual(nativePlayback.legacyQuota.starts, [4]);
  assert.equal(nativePlayback.legacyQuota.watchedMs, 5879);
  assert.equal(nativePlayback.legacyQuota.writes, 1);
  assert.deepEqual(nativePlayback.navigation.seeks, [1, 0.5]);
  assert.deepEqual(nativePlayback.navigation.starts, [0, 0.5]);
  assert.equal(nativePlayback.navigation.watchedMs, 5879);
  assert.equal(nativePlayback.navigation.writes, 2);
  const clockTime = new Date("2026-11-05T12:00:00Z");
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(new Date(clockTime.getTime() + 1000));
  const beforeCooldown = await page.evaluate(async () => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
    const state = {
      calls: 0,
      savedMs: 0,
      restore: () => {
        IDBDatabase.prototype.transaction = original;
      },
    };
    window.closeAudit = state;
    const video = document.createElement("video");
    Object.defineProperties(video, {
      duration: { get: () => 120 },
      paused: { get: () => false },
      played: {
        get: () => ({
          length: 1,
          start: () => 0,
          end: () => video.currentTime,
        }),
      },
    });
    const settle = async () => {
      for (let i = 0; i < 40; i++) await Promise.resolve();
    };
    const stop = ProgressAudit.startVideoProgress(video, {
      storageKey: "close-with-quota",
      prepare: async () => ({
        id: "server-progress-id",
        durationMs: 120_000,
        coverage: new ArrayBuffer(15),
      }),
      save: async (_id, coverage) => {
        if (++state.calls === 1)
          throw new ProgressAudit.ConvexError({
            code: "VIDEO_PROGRESS_RATE_LIMITED",
            retryAfter: 30_000,
          });
        state.savedMs = ProgressAudit.watchedMilliseconds(
          new Uint8Array(coverage),
          120_000,
        );
        return { coverage };
      },
      onPending: () => {},
    });
    await settle();
    video.currentTime = 10;
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("pause"));
    await settle();
    video.dispatchEvent(new Event("playing"));
    video.currentTime = 25;
    video.dispatchEvent(new Event("timeupdate"));
    stop();
    await settle();
    return state.calls;
  });
  assert.equal(beforeCooldown, 1);
  await page.clock.runFor(29_999);
  assert.equal(await page.evaluate(() => window.closeAudit.calls), 1);
  await page.clock.runFor(1);
  const finalized = await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
    const { calls, savedMs, restore } = window.closeAudit;
    restore();
    return { calls, savedMs };
  });
  assert.deepEqual(finalized, { calls: 2, savedMs: 25_000 });
  await page.clock.runFor(300_000);
  assert.equal(await page.evaluate(() => window.closeAudit.calls), 2);
  console.log(
    "PASS Chrome: native playback reaches 100% across reopenings; forward seek correction, free rewind and bookmarks; close during preparation resumes 80s instead of zero; old v1 tabs keep writing beside the new client; existing v2 bookmarks and pending records survive; concurrent merge, stale bookmark protection, atomic pending migration, offline/quota recovery, identity separation and retryAfter.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
