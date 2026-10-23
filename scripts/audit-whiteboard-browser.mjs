import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const {
  joinWhiteboardPayload,
  mergeWhiteboardElements,
  whiteboardBucketId,
  splitWhiteboardPayload,
} = require("../lib/whiteboard-elements.ts");
const {
  appendWhiteboardBucketHistory,
  readWhiteboardBucketHistory,
} = require("../lib/whiteboard-bucket-updates.ts");
// Use the bundler already installed with Vite; no new runtime or dependencies.
const { build } = createRequire(require.resolve("vite"))("esbuild");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "tests/browser/whiteboard-browser.mjs");
const modifier = process.platform === "darwin" ? "Meta" : "Control";
const hotBucket = process.argv.includes("--hot-bucket");
const benchmark = process.argv.includes("--benchmark") || hotBucket;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const assets = resolve(
  dirname(require.resolve("@excalidraw/excalidraw")),
  "../dev",
);
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="40"><rect width="50" height="40" fill="red"/></svg>';
let state;
let bundle;
const streams = new Set();
const reset = () => {
  state = {
    elements: [],
    fileRefs: {},
    files: { "remote-file": svg },
    blocked: false,
    deltas: 0,
    uploads: 0,
    revision: 0,
    buckets: {},
    bucketRevisions: {},
    bucketBytes: {},
    histories: {},
    metrics: {
      deltaBytes: 0,
      liveBytes: 0,
      liveBatches: 0,
      liveReceivedBytes: {},
      fullSnapshotModelBytes: 0,
      responseBytes: {},
      imageBytes: {},
      fullBucketSnapshots: {},
    },
  };
};
reset();
function updateBuckets(changes) {
  state.revision++;
  const affected =
    changes &&
    new Set(changes.map((element) => whiteboardBucketId(element.id)));
  const groups = new Map();
  for (const element of state.elements) {
    const id = whiteboardBucketId(element.id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(element);
  }
  for (const [id, elements] of groups) {
    if (affected && !affected.has(id)) continue;
    const parts = splitWhiteboardPayload(JSON.stringify(elements));
    if (JSON.stringify(parts) !== JSON.stringify(state.buckets[id]?.parts)) {
      const previousRevision = state.buckets[id]?.revision ?? 0;
      state.buckets[id] = {
        generation: 0,
        sourceId: "browser-scene",
        revision: previousRevision + 1,
        baseRevision: null,
        parts,
      };
      if (changes) {
        const winners = new Map(
          elements.map((element) => [element.id, element]),
        );
        state.histories[id] = appendWhiteboardBucketHistory(
          state.histories[id],
          0,
          previousRevision,
          changes
            .filter((element) => whiteboardBucketId(element.id) === id)
            .map((element) => winners.get(element.id)),
        );
      }
      state.bucketRevisions[id] = state.revision;
      state.bucketBytes[id] = Buffer.byteLength(parts.join(""));
    }
  }
}
const notify = () =>
  streams.forEach((response) => response.write("data: changed\n\n"));
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/assets/")) {
      const file = resolve(assets, url.pathname.slice("/assets/".length));
      assert(file.startsWith(`${assets}/`));
      response.setHeader("Content-Type", "font/woff2");
      response.end(await readFile(file));
      return;
    }
    if (url.pathname === "/events") {
      response.whiteboardReadonly = url.searchParams.get("readonly") === "true";
      response.whiteboardClient =
        request.headers["x-benchmark-client"] ?? "unattributed";
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });
      response.write(": ready\n\n");
      streams.add(response);
      request.on("close", () => streams.delete(response));
      return;
    }
    if (url.pathname === "/bundle.js" || url.pathname === "/bundle.css") {
      const output = bundle.outputFiles.find((file) =>
        file.path.endsWith(url.pathname.slice(1)),
      );
      response.writeHead(200, {
        "Content-Type": url.pathname.endsWith("css")
          ? "text/css"
          : "text/javascript",
      });
      response.end(output.contents);
      return;
    }
    if (
      url.pathname === "/image.svg" ||
      url.pathname === "/api/whiteboard-image"
    ) {
      const imageUrl =
        url.pathname === "/api/whiteboard-image"
          ? new URL(url.searchParams.get("url"))
          : url;
      const contents =
        state.files[imageUrl.searchParams.get("fileId") ?? "remote-file"];
      const png = contents.startsWith("data:image/png;base64,");
      const bytes = png
        ? Buffer.from(contents.split(",")[1], "base64")
        : Buffer.from(contents);
      const client = request.headers["x-benchmark-client"] ?? "unattributed";
      state.metrics.imageBytes[client] =
        (state.metrics.imageBytes[client] ?? 0) + bytes.length;
      response.writeHead(200, {
        "Content-Type": png ? "image/png" : "image/svg+xml",
      });
      response.end(bytes);
      return;
    }
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/state") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(state));
      return;
    }
    if (request.method === "GET" && url.pathname === "/scene") {
      if (benchmark) await delay(50);
      const client = request.headers["x-benchmark-client"] ?? "unattributed";
      const since = Number(url.searchParams.get("since") ?? -1);
      const cursors = JSON.parse(url.searchParams.get("cursors") ?? "{}");
      const body = JSON.stringify({
        revision: state.revision,
        manifest: {
          format: 2,
          generation: 0,
          fromLegacy: false,
          legacyOrder: [],
          bucketIds: Object.keys(state.buckets).map(Number),
          sourceId: "browser-scene",
        },
        files: { fileRefs: state.fileRefs },
        buckets: Object.fromEntries(
          Object.entries(state.buckets)
            .filter(
              ([id]) =>
                url.searchParams.has("reload") ||
                state.bucketRevisions[id] > since,
            )
            .map(([id, snapshot]) => {
              const cursor = cursors[id];
              if (
                !cursor ||
                cursor.sourceId !== "browser-scene" ||
                cursor.generation !== 0
              )
                return [id, snapshot];
              const changes = readWhiteboardBucketHistory(
                state.histories[id],
                cursor,
              );
              return [
                id,
                changes !== null
                  ? { ...snapshot, baseRevision: cursor.revision, ...changes }
                  : cursor.revision === snapshot.revision
                    ? { ...snapshot, baseRevision: cursor.revision, parts: [] }
                    : snapshot,
              ];
            })
            .map(([id, result]) => {
              if (result.baseRevision == null && result.parts.length)
                state.metrics.fullBucketSnapshots[client] =
                  (state.metrics.fullBucketSnapshots[client] ?? 0) + 1;
              return [id, result];
            }),
        ),
      });
      state.metrics.responseBytes[client] =
        (state.metrics.responseBytes[client] ?? 0) + Buffer.byteLength(body);
      response.setHeader("Content-Type", "application/json");
      response.end(body);
      return;
    }
    if (request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      let result = {};
      if (url.pathname === "/live") {
        const destinations = JSON.parse(
          request.headers["x-whiteboard-destinations"] ?? "null",
        );
        assert(
          Array.isArray(destinations) && destinations.length > 0,
          "Never broadcast whiteboard bytes to the whole room",
        );
        state.metrics.liveBytes += Buffer.byteLength(raw);
        state.metrics.liveBatches++;
        for (const stream of streams) {
          if (
            !stream.whiteboardReadonly ||
            !destinations.includes("browser-reader")
          )
            continue;
          state.metrics.liveReceivedBytes[stream.whiteboardClient] =
            (state.metrics.liveReceivedBytes[stream.whiteboardClient] ?? 0) +
            Buffer.byteLength(raw);
          stream.write(`event: preview\ndata: ${raw}\n\n`);
        }
        response.setHeader("Content-Type", "application/json");
        response.end("{}");
        return;
      }
      if (
        (url.pathname === "/delta" || url.pathname === "/whiteboard-files") &&
        state.blocked
      ) {
        response.writeHead(503);
        response.end('{"error":"TEST_OFFLINE"}');
        return;
      }
      if (url.pathname === "/initialize" && !state.elements.length) {
        const initial = JSON.parse(raw);
        state.elements = initial.elements;
        state.fileRefs["remote-file"] = {
          url: `${origin}/image.svg`,
          storageId: "test-remote-storage",
          mimeType: "image/svg+xml",
          created: 1,
        };
        for (const [fileId, dataURL] of Object.entries(initial.files ?? {})) {
          state.files[fileId] = dataURL;
          state.fileRefs[fileId] = {
            url: `${origin}/image.svg?fileId=${fileId}`,
            storageId: `test-${fileId}`,
            mimeType: "image/png",
            created: 1,
          };
        }
        updateBuckets();
      } else if (url.pathname === "/delta") {
        if (benchmark) await delay(50);
        state.deltas++;
        state.metrics.deltaBytes += Buffer.byteLength(raw);
        const changes = JSON.parse(
          joinWhiteboardPayload(JSON.parse(raw).parts),
        );
        state.elements = mergeWhiteboardElements(state.elements, changes);
        result = { changed: true, generation: 0, conflictsParts: [] };
        updateBuckets(changes);
        state.metrics.fullSnapshotModelBytes +=
          Object.values(state.bucketBytes).reduce(
            (sum, bytes) => sum + bytes,
            0,
          ) -
          Object.keys(state.bucketBytes).length +
          1;
        notify();
      } else if (url.pathname === "/remote") {
        const changes = JSON.parse(raw);
        state.elements = mergeWhiteboardElements(state.elements, changes);
        updateBuckets(changes);
        notify();
      } else if (url.pathname === "/whiteboard-files") {
        assert.equal(
          request.headers.authorization,
          "Bearer local-browser-test-token",
        );
        state.uploads++;
        const fileId = url.searchParams.get("fileId");
        result = {
          url: `${origin}/image.svg?fileId=${encodeURIComponent(fileId)}`,
          storageId: "test-pending-storage",
          mimeType: "image/svg+xml",
          created: 1,
        };
        state.files[fileId] = raw;
        state.fileRefs[fileId] = result;
        notify();
      } else if (url.pathname !== "/initialize")
        throw new Error(`Unexpected route ${url.pathname}`);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result));
      return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end(
      '<html><head><link rel="stylesheet" href="/bundle.css"><style>html,body,#root{margin:0;width:100%;height:100%}#root>div{height:100%}</style></head><body><div id="root"></div><script>window.EXCALIDRAW_ASSET_PATH="/assets/";</script><script type="module" src="/bundle.js"></script></body></html>',
    );
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
async function expectImagePixel(page, point, color) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ point, color }) => {
          const view = window.whiteboardAudit.state().viewport;
          return [...document.querySelectorAll("canvas")].some((canvas) => {
            const box = canvas.getBoundingClientRect();
            if (!box.width || !box.height) return false;
            const x = Math.floor(
              ((point[0] + view.scrollX) * view.zoom * canvas.width) /
                box.width,
            );
            const y = Math.floor(
              ((point[1] + view.scrollY) * view.zoom * canvas.height) /
                box.height,
            );
            const pixel = canvas
              .getContext("2d")
              ?.getImageData(x, y, 1, 1).data;
            return (
              pixel &&
              color.every((value, index) => Math.abs(pixel[index] - value) < 5)
            );
          });
        },
        { point, color },
      ),
    )
    .toBe(true);
}
try {
  const mocks = {
    "next/dynamic": "export { dynamic as default }",
    "convex/react": "export { useQuery, useQueries, useMutation }",
    "@livekit/components-react": "export { useRoomContext }",
    "@clerk/nextjs": "export { useAuth }",
    "next-intl": "export { useTranslations }",
    "@/lib/error-tracking":
      "export { reportRuntimeError, reportWhiteboardDiagnostic }",
  };
  bundle = await build({
    absWorkingDir: root,
    entryPoints: [fixture],
    outdir: "/virtual",
    entryNames: "bundle",
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    metafile: true,
    conditions: ["development"],
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.NEXT_PUBLIC_CONVEX_SITE_URL": JSON.stringify(origin),
      "process.env.NEXT_PUBLIC_CONVEX_URL": JSON.stringify(origin),
    },
    loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
    logLevel: "silent",
    plugins: [
      {
        name: "single-react-and-local-services",
        setup(builder) {
          builder.onResolve(
            { filter: /^(react|react-dom)(\/.*)?$/ },
            (args) => ({ path: require.resolve(args.path) }),
          );
          builder.onResolve(
            {
              filter:
                /^(next\/dynamic|convex\/react|@livekit\/components-react|@clerk\/nextjs|next-intl|@\/lib\/error-tracking)$/,
            },
            (args) => ({ path: args.path, namespace: "service-mock" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "service-mock" },
            (args) => ({
              contents: `${mocks[args.path]} from ${JSON.stringify(fixture)};`,
              resolveDir: root,
            }),
          );
        },
      },
    ],
  });
  const reactRoots = new Set(
    Object.keys(bundle.metafile.inputs)
      .filter((path) => /\/react\/.*\.js$/.test(path))
      .map((path) => path.split("/react/")[0]),
  );
  assert.equal(
    reactRoots.size,
    1,
    "The harness must bundle exactly one React runtime",
  );
  browser = await chromium.launch({ channel: "chrome", headless: true });
  if (benchmark) {
    const { runWhiteboardBenchmark, runWhiteboardHotBucketBenchmark } =
      await import("./whiteboard-benchmark.mjs");
    await (
      hotBucket ? runWhiteboardHotBucketBenchmark : runWhiteboardBenchmark
    )({
      browser,
      origin,
      reset,
      getState: () => state,
      durableOnly: process.argv.includes("--durable-only"),
    });
  }
  const results = [];
  for (const readonly of benchmark ? [] : [false, true]) {
    reset();
    const context = await browser.newContext({
      viewport: { width: 1100, height: 750 },
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error("PAGE_ERROR", error.stack);
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(() => {
      // Exhaust actual localStorage. IndexedDB remains available for pending drafts.
      try {
        while (true)
          localStorage.setItem(
            `quota-${localStorage.length}`,
            "x".repeat(64 * 1024),
          );
      } catch {}
      try {
        while (true)
          localStorage.setItem(`quota-${localStorage.length}`, "x".repeat(128));
      } catch {}
    });
    await page.goto(`${origin}/${readonly ? "?readonly" : ""}`);
    await page
      .waitForFunction(
        () => window.whiteboardAudit?.state().ready === 1,
        undefined,
        { timeout: 15000 },
      )
      .catch(async (error) => {
        console.error(
          "STARTUP",
          await page.evaluate(() => ({
            state: window.whiteboardAudit?.state(),
            body: document.body.innerText.slice(0, 1000),
          })),
        );
        throw error;
      });
    await expect
      .poll(() =>
        page.evaluate(() => Object.keys(window.whiteboardAudit.state().files)),
      )
      .toContain("remote-file");
    let status = await page.evaluate(() => window.whiteboardAudit.state());
    assert.equal(
      status.apis.length,
      2,
      "Real development StrictMode must provide two APIs",
    );
    assert.deepEqual(
      status.apis[0].files,
      [],
      "Discarded API must not consume images",
    );
    assert(status.apis[1].files.includes("remote-file"));
    await expectImagePixel(page, [165, 200], [255, 0, 0, 255]);
    assert.equal(
      await page.evaluate(() => {
        try {
          localStorage.setItem("quota-probe", "x".repeat(2048));
          return false;
        } catch (error) {
          return error.name === "QuotaExceededError";
        }
      }),
      true,
    );
    if (readonly) {
      await page.evaluate(() => window.whiteboardAudit.remote());
      await page.waitForFunction(() =>
        window.whiteboardAudit
          .state()
          .elements.some((element) => element.id === "remote-later"),
      );
      status = await page.evaluate(() => window.whiteboardAudit.state());
      assert.equal(status.readonly, true);
      assert.equal(status.tokenRequests, 0);
      assert.equal(state.deltas, 0);
      assert.equal(state.uploads, 0);
    } else {
      await page.evaluate(() => window.whiteboardAudit.pencil());
      for (let i = 0; i < 3; i++) {
        await page.mouse.move(350, 330 + i * 55);
        await page.mouse.down();
        await page.mouse.move(550, 350 + i * 55, { steps: 12 });
        await page.mouse.up();
      }
      await page.waitForFunction(
        () =>
          window.whiteboardAudit
            .state()
            .elements.filter(
              (element) => element.type === "freedraw" && !element.isDeleted,
            ).length === 3,
      );
      await expect
        .poll(
          () =>
            state.elements.filter(
              (element) => element.type === "freedraw" && !element.isDeleted,
            ).length,
        )
        .toBe(3);
      await page.keyboard.press(`${modifier}+z`);
      await page.waitForFunction(
        () =>
          window.whiteboardAudit
            .state()
            .elements.filter(
              (element) => element.type === "freedraw" && !element.isDeleted,
            ).length === 2,
      );
      await page.keyboard.press(`${modifier}+Shift+z`);
      await page.waitForFunction(
        () =>
          window.whiteboardAudit
            .state()
            .elements.filter(
              (element) => element.type === "freedraw" && !element.isDeleted,
            ).length === 3,
      );
      status = await page.evaluate(() => window.whiteboardAudit.state());
      assert.equal(
        status.apis.length,
        2,
        "Drawing must retain the mounted API",
      );
      assert.equal(status.tool, "freedraw", "Drawing must retain the pencil");
      for (const id of ["remote-base", "remote-image"]) {
        assert(
          status.elements.some(
            (element) => element.id === id && !element.isDeleted,
          ),
          "Undo/redo must preserve remote drawings and images",
        );
      }
      state.blocked = true;
      const pendingFile = await page.evaluate(() =>
        window.whiteboardAudit.addImage(),
      );
      await page.evaluate(() => window.whiteboardAudit.pencil());
      await page.mouse.move(350, 540);
      await page.mouse.down();
      await page.mouse.move(570, 550, { steps: 12 });
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const draft = await window.whiteboardAudit.draft();
            return (
              draft?.saved === false &&
              draft.elements.filter(
                (element) => element.type === "freedraw" && !element.isDeleted,
              ).length === 4 &&
              Boolean(draft.files["pending-file"])
            );
          }),
        )
        .toBe(true);
      const ids = await page.evaluate(() =>
        window.whiteboardAudit
          .state()
          .elements.filter((element) => !element.isDeleted)
          .map((element) => element.id)
          .sort(),
      );
      state.blocked = false;
      await page.reload();
      await page.waitForFunction(
        () => window.whiteboardAudit?.state().ready === 1,
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.whiteboardAudit
              .state()
              .elements.filter((element) => !element.isDeleted)
              .map((element) => element.id)
              .sort(),
          ),
        )
        .toEqual(ids);
      assert.equal(
        await page.evaluate(
          () => window.whiteboardAudit.state().files["pending-file"].dataURL,
        ),
        pendingFile.dataURL,
      );
      await expectImagePixel(page, [250, 200], [0, 0, 255, 255]);
      await expect
        .poll(() =>
          state.elements
            .filter((element) => !element.isDeleted)
            .map((element) => element.id)
            .sort(),
        )
        .toEqual(ids);
      await expect.poll(() => state.uploads).toBeGreaterThan(0);
      assert(state.files["pending-file"].includes('fill="blue"'));
      await expect
        .poll(() =>
          page.evaluate(async () =>
            Boolean(
              (await window.whiteboardAudit.draft())?.files["pending-file"],
            ),
          ),
        )
        .toBe(true);
      const precedingDraft = await page.evaluate(async () =>
        (await window.whiteboardAudit.draft()).elements
          .map((element) => element.id)
          .sort(),
      );
      // Also reject IndexedDB writes, retaining its existing recoverable draft.
      await page.addInitScript(() => {
        const put = IDBObjectStore.prototype.put;
        window.quotaRejections = 0;
        IDBObjectStore.prototype.put = function (...args) {
          if (["scenes", "files"].includes(this.name)) {
            window.quotaRejections++;
            throw new DOMException("Test quota", "QuotaExceededError");
          }
          return put.apply(this, args);
        };
      });
      await page.reload();
      await page.waitForFunction(
        () => window.whiteboardAudit?.state().ready === 1,
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.whiteboardAudit
              .state()
              .elements.filter((element) => !element.isDeleted)
              .map((element) => element.id)
              .sort(),
          ),
        )
        .toEqual(ids);
      await page.evaluate(() => window.whiteboardAudit.pencil());
      await page.mouse.move(350, 620);
      await page.mouse.down();
      await page.mouse.move(570, 630, { steps: 12 });
      await page.mouse.up();
      await expect
        .poll(
          () =>
            state.elements.filter(
              (element) => element.type === "freedraw" && !element.isDeleted,
            ).length,
        )
        .toBe(5);
      await page.waitForFunction(() => window.quotaRejections > 0);
      assert.deepEqual(
        await page.evaluate(async () =>
          (await window.whiteboardAudit.draft()).elements
            .map((element) => element.id)
            .sort(),
        ),
        precedingDraft,
      );
      const confirmedIds = state.elements
        .filter((element) => !element.isDeleted)
        .map((element) => element.id)
        .sort();
      await page.reload();
      await page.waitForFunction(
        () => window.whiteboardAudit?.state().ready === 1,
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.whiteboardAudit
              .state()
              .elements.filter((element) => !element.isDeleted)
              .map((element) => element.id)
              .sort(),
          ),
        )
        .toEqual(confirmedIds);
      assert.equal(
        await page.evaluate(
          () => window.whiteboardAudit.state().files["pending-file"].dataURL,
        ),
        pendingFile.dataURL,
      );
      const draftBeforeClose = await page.evaluate(() =>
        window.whiteboardAudit.draft(),
      );
      await page.evaluate(() => {
        window.whiteboardAudit.pencil();
        window.whiteboardAudit.closeOnNextStroke();
      });
      await page.mouse.move(650, 350);
      await page.mouse.down();
      await page.mouse.move(850, 380, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction(() =>
        Boolean(window.whiteboardAudit.closedScene()),
      );
      const closedScene = await page.evaluate(() =>
        window.whiteboardAudit.closedScene(),
      );
      const closedIds = closedScene.elements
        .filter((element) => !element.isDeleted)
        .map((element) => element.id)
        .sort();
      assert.equal(closedIds.length, confirmedIds.length + 1);
      await expect
        .poll(() =>
          state.elements
            .filter((element) => !element.isDeleted)
            .map((element) => element.id)
            .sort(),
        )
        .toEqual(closedIds);
      const finalStroke = closedScene.elements.find(
        (element) => !element.isDeleted && !confirmedIds.includes(element.id),
      );
      assert(finalStroke, "The closing stroke must be finalized");
      assert.deepEqual(
        state.elements.find((element) => element.id === finalStroke.id)?.points,
        finalStroke.points,
        "Immediate close must retain the last point, not only the stroke ID",
      );
      assert.equal(
        state.elements.find((element) => element.id === finalStroke.id)
          ?.version,
        finalStroke.version,
      );
      assert.equal(
        state.elements.find((element) => element.id === finalStroke.id)
          ?.versionNonce,
        finalStroke.versionNonce,
      );
      const retainedDraft = await page.evaluate(() =>
        window.whiteboardAudit.draft(),
      );
      assert.deepEqual(
        retainedDraft,
        draftBeforeClose,
        "Full stores must retain the preceding draft and image bytes",
      );
      assert.equal(
        closedScene.files["pending-file"].dataURL,
        pendingFile.dataURL,
      );
      await page.reload();
      await page.waitForFunction(
        () => window.whiteboardAudit?.state().ready === 1,
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.whiteboardAudit
              .state()
              .elements.filter((element) => !element.isDeleted)
              .map((element) => element.id)
              .sort(),
          ),
        )
        .toEqual(closedIds);
      assert.equal(
        await page.evaluate(
          () => window.whiteboardAudit.state().files["pending-file"].dataURL,
        ),
        pendingFile.dataURL,
      );
      await expectImagePixel(page, [165, 200], [255, 0, 0, 255]);
      await expectImagePixel(page, [250, 200], [0, 0, 255, 255]);
    }
    status = await page.evaluate(() => window.whiteboardAudit.state());
    assert.equal(
      status.apis.length,
      2,
      "Drawing/reconciliation must not remount the editor",
    );
    assert.deepEqual(errors, []);
    results.push({
      role: readonly ? "reader" : "writer",
      strictModeApis: status.apis.length,
      visibleElements: status.elements.filter((element) => !element.isDeleted)
        .length,
      images: Object.keys(status.files),
      pageErrors: errors,
    });
    await context.close();
  }
  if (!benchmark)
    console.log(
      JSON.stringify(
        {
          browser: await browser.version(),
          reactRuntimes: reactRoots.size,
          results,
        },
        null,
        2,
      ),
    );
} finally {
  await browser?.close();
  for (const response of streams) response.end();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
