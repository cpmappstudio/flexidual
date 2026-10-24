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
const {
  whiteboardPreviewRevision,
} = require("../lib/whiteboard-preview-revision.ts");
// Use the bundler already installed with Vite; no new runtime or dependencies.
const { build } = createRequire(require.resolve("vite"))("esbuild");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "tests/browser/whiteboard-browser.mjs");
const modifier = process.platform === "darwin" ? "Meta" : "Control";
const hotBucket = process.argv.includes("--hot-bucket");
const benchmark = process.argv.includes("--benchmark") || hotBucket;
const notebookPreview = process.argv.includes("--notebook-preview");
const courseMenu = process.argv.includes("--course-menu");
const mobileLayout = process.argv.includes("--mobile-layout");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const assets = resolve(
  dirname(require.resolve("@excalidraw/excalidraw")),
  "../dev",
);
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="40"><rect width="50" height="40" fill="red"/></svg>';
let state;
let bundle;
let appStyles = "";
let previewPng;
const streams = new Set();
const reset = () => {
  state = {
    elements: [],
    fileRefs: {},
    files: { "remote-file": svg },
    blocked: false,
    deltas: 0,
    uploads: 0,
    previewUploads: 0,
    previewAttempts: 0,
    previewFailures: 0,
    previewVersion: 0,
    previewRevision: null,
    pageTitle: "Earlier lesson",
    titleWrites: 0,
    retired: false,
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
    if (url.pathname === "/app.css") {
      response.setHeader("Content-Type", "text/css");
      response.end(appStyles);
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
    if (url.pathname === "/preview.png") {
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      response.end(previewPng);
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
        pageTitle: state.pageTitle,
        revision: state.revision,
        manifest: {
          format: 2,
          generation: 0,
          fromLegacy: false,
          legacyOrder: [],
          bucketIds: Object.keys(state.buckets).map(Number),
          sourceId: "browser-scene",
          sessionPageId: notebookPreview
            ? "browser-session-page"
            : "browser-page",
          ...(notebookPreview ? { notebookPageId: "browser-page" } : {}),
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
      if (url.pathname === "/rename") {
        const args = JSON.parse(raw);
        assert.equal(args.pageId, "browser-page");
        assert(args.title.trim().length > 0 && args.title.trim().length <= 200);
        state.pageTitle = args.title.trim();
        state.titleWrites++;
        notify();
        response.setHeader("Content-Type", "application/json");
        response.end("null");
        return;
      }
      if (url.pathname === "/preview") {
        const args = JSON.parse(raw);
        assert.equal(args.pageId, "browser-page");
        assert.match(args.revision, /^[a-f0-9]{64}$/);
        assert.equal(
          args.revision,
          await whiteboardPreviewRevision(state.elements),
        );
        if (
          args.retireIfEmpty &&
          state.elements.every((element) => element.isDeleted)
        ) {
          state.retired = true;
          previewPng = undefined;
          state.previewVersion++;
          state.previewRevision = null;
          result = null;
        } else if (args.revision === state.previewRevision) result = null;
        else {
          if (args.expectedVersion !== undefined)
            assert.equal(args.expectedVersion, state.previewVersion);
          else state.previewVersion++;
          state.previewRequestedRevision = args.revision;
          result = state.previewVersion;
        }
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(result));
        return;
      }
      if (
        url.pathname === "/whiteboard-files" &&
        url.searchParams.has("previewVersion")
      ) {
        assert.equal(
          request.headers.authorization,
          "Bearer local-browser-test-token",
        );
        assert.equal(url.searchParams.get("pageId"), "browser-page");
        assert.equal(
          Number(url.searchParams.get("previewVersion")),
          state.previewVersion,
        );
        state.previewAttempts++;
        if (state.previewFailures-- > 0) {
          response.writeHead(503, { "Content-Type": "application/json" });
          response.end('{"error":"TEST_PREVIEW_OFFLINE"}');
          return;
        }
        previewPng = Buffer.concat(chunks);
        assert.equal(previewPng.subarray(1, 4).toString(), "PNG");
        assert(previewPng.length <= 256 * 1024);
        state.previewUploads++;
        state.previewRevision = state.previewRequestedRevision;
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            url: `${origin}/preview.png`,
            storageId: "preview-storage",
            mimeType: "image/png",
            created: 1,
          }),
        );
        return;
      }
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
      '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/bundle.css"><style>html,body,#root{margin:0;width:100%;height:100%}#root>div,[data-slot="board-workspace"]{height:100%;width:100%;overflow:hidden}[data-slot="board-workspace"]>section{box-sizing:border-box;height:100%;overflow:auto}[data-slot="dialog-overlay"],[data-slot="board-backdrop"]{position:fixed;inset:0;z-index:50;background:#0004}[data-slot="dialog-content"]{box-sizing:border-box;position:fixed;display:flex;flex-direction:column;top:10%;left:10%;translate:none;transform:none;width:80%;height:80%;overflow:hidden;z-index:51;background:white;padding:16px}[data-slot="dialog-content"]>div,[data-slot="board-workspace"]>div>div:last-child{min-height:0;flex:1}[data-slot="board-workspace"]>div{height:100%;display:flex;flex-direction:column}</style></head><body><div id="root"></div><script>window.EXCALIDRAW_ASSET_PATH="/assets/";</script><script type="module" src="/bundle.js"></script></body></html>',
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
  if (courseMenu || mobileLayout) {
    const tailwind = require("@tailwindcss/postcss");
    const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
      "postcss",
    );
    const from = resolve(root, "app/globals.css");
    appStyles = (
      await postcss([tailwind({ base: root })]).process(
        await readFile(from, "utf8"),
        { from },
      )
    ).css;
  }
  const mocks = {
    "next/dynamic": "export { dynamic as default }",
    "convex/react":
      "export { useQuery, useQueries, useMutation, usePaginatedQuery }",
    "@livekit/components-react": "export { useRoomContext }",
    "@clerk/nextjs": "export { useAuth }",
    "next-intl": "export { useTranslations, useFormatter }",
    "next/image": "export { image as default }",
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
                /^(next\/(dynamic|image)|convex\/react|@livekit\/components-react|@clerk\/nextjs|next-intl|@\/lib\/error-tracking)$/,
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
  if (courseMenu || mobileLayout) {
    const cases = mobileLayout
      ? [
          { readonly: false, viewport: { width: 320, height: 568 } },
          { readonly: false, viewport: { width: 390, height: 844 } },
          { readonly: false, viewport: { width: 844, height: 390 } },
          { readonly: false, viewport: { width: 1024, height: 768 } },
          { readonly: false, viewport: { width: 1280, height: 900 } },
          {
            readonly: false,
            viewport: { width: 390, height: 844 },
            safeArea: true,
          },
          { readonly: true, viewport: { width: 390, height: 844 } },
        ]
      : [1100, 1600].flatMap((width) =>
          [false, true].map((readonly) => ({
            readonly,
            viewport: { width, height: 750 },
          })),
        );
    for (const { readonly, viewport, safeArea = false } of cases) {
      reset();
      const context = await browser.newContext({
        viewport,
        ...(mobileLayout ? { isMobile: true, hasTouch: true } : {}),
      });
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      const page = await context.newPage();
      if (mobileLayout)
        await page.addInitScript(() => {
          // Exercise the SDK's input-file path used by mobile browsers, not Chrome's OS picker.
          delete window.showOpenFilePicker;
        });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}/?course-menu${readonly ? "&readonly" : ""}`);
      await page.getByRole("button", { name: "Earlier lesson Date" }).click();
      const panel = page.locator('[data-slot="dialog-content"]');
      const canvas = panel.locator(".excalidraw:not(.whiteboard-ui-overlay)");
      await expect(canvas).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() =>
            Object.keys(window.whiteboardAudit.state().files),
          ),
        )
        .toContain("remote-file");
      const apiCount = await page.evaluate(
        () => window.whiteboardAudit.state().apis.length,
      );
      await page.evaluate(() => {
        document.body.style.height = "3000px";
        window.scrollTo(0, 200);
      });
      const backgroundScroll = await page.evaluate(() => window.scrollY);
      async function checkBackgroundScroll(x, y) {
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(150);
        expect(await page.evaluate(() => window.scrollY)).toBe(
          backgroundScroll,
        );
        if (mobileLayout) {
          const touch = await context.newCDPSession(page);
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: Math.round(x), y: Math.round(y) }],
          });
          for (let step = 1; step <= 4; step++) {
            await touch.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ x: Math.round(x), y: Math.round(y - step * 15) }],
            });
            await page.waitForTimeout(20);
          }
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await touch.detach();
          await page.waitForTimeout(200);
          expect(await page.evaluate(() => window.scrollY)).toBe(
            backgroundScroll,
          );
        }
      }
      await checkBackgroundScroll(2, viewport.height / 2);
      if (!readonly) {
        const settings = panel.getByRole("button", {
          name: "Edit",
          exact: true,
        });
        await expect(settings).toHaveCount(0);
        await page.evaluate(() => window.whiteboardAudit.selectFirstElement());
        await expect(settings).toHaveCount(1);
        await expect(settings).toHaveClass(/whiteboard-properties-trigger/);
        const propertiesButtonBox = await settings.boundingBox();
        const hamburgerBox = await canvas
          .getByTestId("main-menu-trigger")
          .boundingBox();
        expect(propertiesButtonBox.width).toBe(hamburgerBox.width);
        expect(propertiesButtonBox.height).toBe(hamburgerBox.height);
        if (!(await panel.locator(".whiteboard-mobile-toolbar").isVisible())) {
          expect(
            Math.abs(propertiesButtonBox.x - hamburgerBox.x),
          ).toBeLessThanOrEqual(1);
          expect(
            propertiesButtonBox.y - hamburgerBox.y - hamburgerBox.height,
          ).toBeGreaterThanOrEqual(10);
        }
        await page.screenshot({
          path: `/tmp/board-aligned-settings-${viewport.width}.png`,
        });
        await canvas.getByTestId("main-menu-trigger").click();
        await expect(settings).toHaveCount(0);
        const menuButtonBox = await canvas
          .getByTestId("main-menu-trigger")
          .boundingBox();
        const menuBox = await canvas.getByTestId("dropdown-menu").boundingBox();
        expect(menuBox.y).toBeGreaterThanOrEqual(
          menuButtonBox.y + menuButtonBox.height,
        );
        await canvas.getByTestId("main-menu-trigger").click();
        await expect(settings).toHaveCount(1);
        await settings.click();
        await expect(
          canvas.locator(".App-menu__left, .App-mobile-menu"),
        ).toBeVisible();
        const opacity = canvas.getByTestId("opacity");
        const opacityRange = opacity.locator("..");
        await expect(opacity).toHaveAccessibleName("Opacity");
        await expect(opacityRange.locator(".zero-label")).toBeHidden();
        await expect(opacityRange.locator(".value-bubble")).toBeHidden();
        await expect(opacity).toHaveValue("100");
        await opacity.focus();
        await page.keyboard.press("Home");
        await expect(opacity).toHaveValue("0");
        await page.keyboard.press("ArrowRight");
        await expect(opacity).toHaveValue("10");
        await expect
          .poll(() =>
            page.evaluate(
              () => window.whiteboardAudit.state().elements[0].opacity,
            ),
          )
          .toBe(10);
        await page.keyboard.press("End");
        await expect(opacity).toHaveValue("100");
        const opacityElement = await page.evaluate(
          () => window.whiteboardAudit.state().elements[0],
        );
        // Finish the real opacity edit before measuring tool-only UI writes.
        await expect
          .poll(
            () =>
              state.elements.find((element) => element.id === opacityElement.id)
                ?.version,
          )
          .toBe(opacityElement.version);
        await page.evaluate(() => window.whiteboardAudit.deselect());
        await expect(settings).toHaveCount(0);
        await expect(
          canvas.locator(".App-menu__left, .App-mobile-menu"),
        ).toBeHidden();
      }
      if (courseMenu && !readonly) {
        const compactTools = panel.locator(".whiteboard-mobile-toolbar");
        if (await compactTools.isVisible())
          await compactTools.getByTestId("compact-tool-freedraw").click();
        else
          await canvas
            .locator('label:has([data-testid="toolbar-freedraw"])')
            .click();
        const properties = canvas.locator(".App-menu__left, .App-mobile-menu");
        await expect(properties).toBeHidden();
        const toggle = panel.getByRole("button", { name: "Edit", exact: true });
        await toggle.click();
        await expect(properties).toBeVisible();
        await properties.getByTestId("color-top-pick-#e03131").click();
        await toggle.click();
        await expect(properties).toBeHidden();
        await toggle.click();
        await expect(properties).toBeVisible();
        const surface = await canvas.boundingBox();
        await page.mouse.move(surface.x + surface.width - 80, surface.y + 60);
        await page.mouse.down();
        await page.mouse.move(surface.x + surface.width - 50, surface.y + 80, {
          steps: 4,
        });
        await page.mouse.up();
        await expect(properties).toBeHidden();
        const strokes = () =>
          page.evaluate(
            () =>
              window.whiteboardAudit
                .state()
                .elements.filter((e) => e.type === "freedraw" && !e.isDeleted)
                .length,
          );
        await expect.poll(strokes).toBe(1);
        await canvas.getByTestId("button-undo").click();
        await expect.poll(strokes).toBe(0);
        await canvas.getByTestId("button-redo").click();
        await expect.poll(strokes).toBe(1);
        if (await compactTools.isVisible())
          await compactTools.getByTestId("compact-tool-selection").click();
        else
          await canvas
            .locator('label:has([data-testid="toolbar-selection"])')
            .click();
      }
      if (mobileLayout) {
        if (safeArea)
          await panel.locator(".whiteboard-sdk-host").evaluate((node) => {
            node.style.setProperty("--sat", "30px");
            node.style.setProperty("--sab", "20px");
            node.style.setProperty("--sal", "15px");
            node.style.setProperty("--sar", "15px");
          });
        const surface = await canvas.boundingBox();
        const toolbar = panel.locator(".whiteboard-mobile-toolbar");
        const menuBounds = await canvas
          .getByTestId("main-menu-trigger")
          .boundingBox();
        await page.screenshot({
          path: `/tmp/board-compact-start-${viewport.width}.png`,
        });
        assert(
          menuBounds.y < surface.y + 60,
          `Menu must be at top left: ${JSON.stringify({ viewport, surface, menuBounds })}`,
        );
        if (!readonly) {
          const boardBounds = await canvas
            .getByRole("button", { name: "Board", exact: true })
            .boundingBox();
          assert(
            Math.abs(boardBounds.width - boardBounds.height) <= 1 &&
              boardBounds.width >= 32,
            "Board icon button must remain square",
          );
          const uiWrites = state.deltas;
          await expect(toolbar).toBeVisible();
          const bounds = await toolbar.boundingBox();
          assert(bounds.y > surface.y + surface.height / 2);
          assert(bounds.height <= 48, "Compact toolbar must be a single row");
          for (const button of await toolbar.getByRole("button").all()) {
            if (!(await button.isVisible())) continue;
            const box = await button.boundingBox();
            assert(
              box.x >= bounds.x &&
                box.x + box.width <= bounds.x + bounds.width + 1,
              "No tool may be clipped",
            );
          }
          await toolbar.getByTestId("compact-tool-rectangle").tap();
          const popup = panel.locator(".whiteboard-tool-popover");
          await expect(popup).toBeVisible();
          const popupBox = await popup.boundingBox();
          assert(
            popupBox.y >= surface.y &&
              popupBox.y + popupBox.height <= bounds.y &&
              popupBox.x >= surface.x &&
              popupBox.x + popupBox.width <= surface.x + surface.width + 1,
            "Grouped tools must open above the toolbar inside the editor",
          );
          await popup.getByTestId("compact-tool-ellipse").tap();
          await expect
            .poll(() =>
              page.evaluate(() => window.whiteboardAudit.state().tool),
            )
            .toBe("ellipse");
          await toolbar.getByTestId("compact-tool-arrow").tap();
          await popup.getByTestId("compact-tool-line").tap();
          await expect
            .poll(() =>
              page.evaluate(() => window.whiteboardAudit.state().tool),
            )
            .toBe("line");
          await toolbar.getByTestId("compact-more").tap();
          await expect(popup).toBeVisible();
          await page.screenshot({
            path: `/tmp/board-compact-more-${viewport.width}.png`,
          });
          const moreBox = await popup.boundingBox();
          assert(
            moreBox.x >= surface.x &&
              moreBox.x + moreBox.width <= surface.x + surface.width + 1,
            `More menu must not overflow: ${JSON.stringify({ surface, moreBox })}`,
          );
          await popup.getByTestId("compact-tool-laser").tap();
          await expect
            .poll(() =>
              page.evaluate(() => window.whiteboardAudit.state().tool),
            )
            .toBe("laser");
          await toolbar.getByTestId("compact-tool-freedraw").tap();
          await expect(
            canvas.locator(".App-mobile-menu, .App-menu__left"),
          ).toBeHidden();
          await panel.getByRole("button", { name: "Edit", exact: true }).tap();
          const properties = canvas.locator(
            ".App-mobile-menu, .App-menu__left",
          );
          await expect(properties).toBeVisible();
          const p = await properties.boundingBox();
          assert(
            p.y >= surface.y && p.y + p.height <= bounds.y,
            "Properties must not cover toolbar or escape editor",
          );
          await properties.getByTestId("color-top-pick-#e03131").tap();
          await panel.getByRole("button", { name: "Edit", exact: true }).tap();
          assert.equal(
            state.deltas,
            uiWrites,
            "Changing tools and properties must not write scene deltas",
          );
          await toolbar.getByTestId("compact-tool-selection").tap();
          await page.keyboard.press("p");
          await expect
            .poll(() =>
              page.evaluate(() => window.whiteboardAudit.state().tool),
            )
            .toBe("freedraw");
          await panel.getByRole("button", { name: "Edit", exact: true }).tap();
          await expect(properties).toBeVisible();
          const propertyBounds = await properties.boundingBox();
          const touch = await context.newCDPSession(page);
          const x = Math.round(surface.x + surface.width / 2),
            y = Math.round(surface.y + (propertyBounds.y - surface.y) / 2);
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y }],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { x: x + 35, y: y + Math.min(25, (propertyBounds.y - y) / 2) },
            ],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await touch.detach();
          await expect(properties).toBeHidden();
          const strokes = () =>
            page.evaluate(
              () =>
                window.whiteboardAudit
                  .state()
                  .elements.filter((e) => e.type === "freedraw" && !e.isDeleted)
                  .length,
            );
          await expect.poll(strokes).toBe(1);
          await canvas.getByTestId("button-undo").tap();
          await expect.poll(strokes).toBe(0);
          await canvas.getByTestId("button-redo").tap();
          await expect.poll(strokes).toBe(1);
          await toolbar.getByTestId("compact-tool-selection").tap();
          await expect
            .poll(() =>
              page.evaluate(() => window.whiteboardAudit.state().tool),
            )
            .toBe("selection");
          if (viewport.width === 320) {
            await toolbar.getByTestId("compact-more").tap();
            await popup.getByTestId("compact-tool-text").tap();
            await page.touchscreen.tap(x, y + 40);
            const textEditor = canvas.locator("textarea.excalidraw-wysiwyg");
            await expect(textEditor).toBeVisible();
            await textEditor.fill("Mobile note");
            await page.keyboard.press("Escape");
            await expect
              .poll(() =>
                page.evaluate(() =>
                  window.whiteboardAudit
                    .state()
                    .elements.some(
                      (e) =>
                        e.type === "text" && e.originalText === "Mobile note",
                    ),
                ),
              )
              .toBe(true);
            await toolbar.getByTestId("compact-more").tap();
            const chooser = page.waitForEvent("filechooser");
            await popup.getByTestId("compact-tool-image").tap();
            const png = await page.evaluate(() => {
              const c = document.createElement("canvas");
              c.width = c.height = 10;
              c.getContext("2d").fillRect(0, 0, 10, 10);
              return c.toDataURL("image/png").split(",")[1];
            });
            await (
              await chooser
            ).setFiles({
              name: "mobile.png",
              mimeType: "image/png",
              buffer: Buffer.from(png, "base64"),
            });
            await expect
              .poll(() =>
                page.evaluate(
                  () =>
                    window.whiteboardAudit
                      .state()
                      .elements.filter(
                        (e) => e.type === "image" && !e.isDeleted,
                      ).length,
                ),
              )
              .toBe(2);
            await toolbar.getByTestId("compact-more").tap();
            await popup
              .getByRole("button", { name: "Mermaid to Excalidraw" })
              .tap();
            await expect(
              page.locator('.excalidraw-modal-container [role="dialog"]'),
            ).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(panel).toBeVisible();
          }
          await page.screenshot({
            path: `/tmp/board-compact-${viewport.width}.png`,
          });
        } else await expect(toolbar).toHaveCount(0);
      }
      if (!readonly) {
        const title = panel.getByRole("textbox", { name: "pageName" });
        await title.fill("Renamed lesson");
        await expect.poll(() => state.pageTitle).toBe("Renamed lesson");
        assert.equal(state.titleWrites, 1);
        await title.fill("Pending browser title");
        await expect(title).toHaveValue("Pending browser title");
        assert.equal(
          await page.evaluate(() =>
            window.dispatchEvent(
              new Event("beforeunload", { cancelable: true }),
            ),
          ),
          false,
          "A title pending confirmation must protect navigation",
        );
        await expect.poll(() => state.pageTitle).toBe("Pending browser title");
        await expect(title).toHaveValue("Pending browser title");
        assert.equal(state.titleWrites, 2);
      }
      const menu = async () => {
        await canvas.getByTestId("main-menu-trigger").click();
        await expect(canvas.getByTestId("image-export-button")).toBeVisible();
        await expect(canvas.getByTestId("search-menu-button")).toBeVisible();
        if (mobileLayout) {
          const menuBox = await canvas
            .locator(".dropdown-menu:visible")
            .boundingBox();
          const surface = await canvas.boundingBox();
          assert(
            menuBox.x >= surface.x &&
              menuBox.x + menuBox.width <= surface.x + surface.width + 1 &&
              menuBox.y >= surface.y &&
              menuBox.y + menuBox.height <= surface.y + surface.height + 1,
            "Main menu must remain inside the Board",
          );
        }
        await expect(canvas.getByTestId("help-menu-item")).toHaveCount(0);
        await expect(
          canvas.getByRole("link", { name: /GitHub|Follow us|Discord/ }),
        ).toHaveCount(0);
      };
      await menu();
      await expect(canvas.getByTestId("clear-canvas-button")).toHaveCount(
        readonly ? 0 : 1,
      );
      await canvas.getByTestId("image-export-button").click();
      const sdkDialog = page.locator(
        '.excalidraw-modal-container [role="dialog"]',
      );
      await expect(sdkDialog).toBeVisible();
      const exportSetting = sdkDialog.getByRole("checkbox").first();
      const checked = await exportSetting.isChecked();
      await exportSetting.setChecked(!checked);
      await expect(exportSetting).toBeChecked({ checked: !checked });
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
        assert(
          await sdkDialog.evaluate((node) =>
            node.contains(document.activeElement),
          ),
          "Export keyboard focus must stay in its window",
        );
      }
      await page.keyboard.press("Escape");
      await expect(sdkDialog).toHaveCount(0);
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "Close", exact: true }).focus();
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        assert(
          await panel.evaluate((node) => node.contains(document.activeElement)),
          "Board keyboard navigation must not reach the covered course page",
        );
      }
      await menu();
      await canvas.getByTestId("search-menu-button").click();
      await expect(
        canvas.getByPlaceholder("Find text on canvas"),
      ).toBeVisible();
      await canvas.getByPlaceholder("Find text on canvas").fill("lesson");
      await page.keyboard.press("Escape");
      await expect(panel).toBeVisible();
      if (!readonly) {
        await menu();
        await canvas.getByTestId("clear-canvas-button").click();
        await sdkDialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await expect(panel).toBeVisible();
        assert(
          (
            await page.evaluate(() => window.whiteboardAudit.state().elements)
          ).some((element) => !element.isDeleted),
        );
        await menu();
        await canvas.getByTestId("clear-canvas-button").click();
        await sdkDialog
          .getByRole("button", { name: "Confirm", exact: true })
          .click();
        await page.waitForFunction(() =>
          window.whiteboardAudit
            .state()
            .elements.every((element) => element.isDeleted),
        );
        const box = await canvas.boundingBox();
        await canvas.click({
          position: { x: box.width / 2, y: box.height / 2 },
        });
        await page.keyboard.press(`${modifier}+z`);
        await page.waitForFunction(() =>
          window.whiteboardAudit
            .state()
            .elements.some((element) => !element.isDeleted),
        );
        await page.keyboard.press(`${modifier}+Shift+z`);
        await page.waitForFunction(() =>
          window.whiteboardAudit
            .state()
            .elements.every((element) => element.isDeleted),
        );
      }
      assert.equal(
        await page.evaluate(() => window.whiteboardAudit.state().apis.length),
        apiCount,
        "SDK windows must not remount the canvas",
      );
      if (mobileLayout && !readonly) {
        if (viewport.width === 1024) {
          await page.setViewportSize({ width: 1600, height: 900 });
          await expect(panel.locator(".whiteboard-mobile-toolbar")).toHaveCount(
            0,
          );
          await page.setViewportSize(viewport);
          await expect(
            panel.locator(".whiteboard-mobile-toolbar"),
          ).toBeVisible();
          assert.equal(
            await page.evaluate(
              () => window.whiteboardAudit.state().apis.length,
            ),
            apiCount,
            "Resizing must not remount the canvas",
          );
        }
      }
      if (!readonly) {
        // Test gallery scrolling independently of the native SDK keyboard/dialog checks.
        await page.evaluate(
          (position) => window.scrollTo(0, position),
          backgroundScroll,
        );
        await canvas
          .getByRole("button", { name: "Board", exact: true })
          .click();
        await expect(canvas).toHaveCount(0);
        const gallery = panel.locator(
          '[data-slot="board-workspace"] > section',
        );
        await expect(gallery).toBeVisible();
        await gallery.evaluate((node) => {
          const spacer = document.createElement("div");
          spacer.style.height = "2500px";
          node.append(spacer);
        });
        const galleryBox = await gallery.boundingBox();
        await checkBackgroundScroll(
          galleryBox.x + galleryBox.width / 2,
          galleryBox.y + galleryBox.height / 2,
        );
        expect(
          await gallery.evaluate((node) => node.scrollTop),
        ).toBeGreaterThan(0);
        await gallery.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        await checkBackgroundScroll(
          galleryBox.x + galleryBox.width / 2,
          galleryBox.y + galleryBox.height / 2,
        );
      }
      await panel.getByRole("button", { name: "Close", exact: true }).click();
      await expect(panel).toHaveCount(0);
      await page.mouse.move(2, 2);
      await page.mouse.wheel(0, 300);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(backgroundScroll);
      if (!readonly) await expect.poll(() => state.retired).toBe(true);
      assert.deepEqual(errors, []);
      results.push({
        courseMenu: true,
        ...(mobileLayout
          ? { viewport, safeArea, touchDrawing: !readonly }
          : {}),
        readonly,
        exportInteractive: true,
        resetInteractive: !readonly,
        findInteractive: true,
        propertiesAutoClose: !readonly,
        canvasRemounts: 0,
        emptyRetiredOnClose: !readonly,
        pageErrors: errors,
      });
      await context.close();
    }
  }
  if (mobileLayout) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1100, height: 750 },
    ]) {
      reset();
      const context = await browser.newContext({ viewport });
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      const page = await context.newPage();
      await page.goto(`${origin}/?readonly&presentation`);
      await page.waitForFunction(
        () => window.whiteboardAudit?.state().ready === 1,
      );
      await expect(
        page.locator(".excalidraw:not(.whiteboard-ui-overlay)"),
      ).toBeVisible();
      for (const ui of [
        ".App-top-bar",
        ".App-bottom-bar",
        ".layer-ui__wrapper",
      ])
        await expect(page.locator(ui)).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Board", exact: true }),
      ).toHaveCount(0);
      results.push({ viewport, presentationControlsHidden: true });
      await context.close();
    }
  }
  if (notebookPreview) {
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
    page.on("pageerror", (error) => errors.push(error.message));
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
    let releaseClosedImage;
    let failClosedImage = true;
    const delayedImage = async (route) => {
      if (!failClosedImage) return route.continue();
      failClosedImage = false;
      await new Promise((resolve) => {
        releaseClosedImage = resolve;
      });
      await route.fulfill({
        status: 503,
        body: "temporary image failure after close",
      });
    };
    await page.route("**/api/whiteboard-image?**", delayedImage);
    const ready = async (readonly = false, waitForImage = true) => {
      await page.goto(
        `${origin}/?notebook-preview${readonly ? "&readonly" : ""}`,
      );
      await page.waitForFunction(
        () => window.whiteboardAudit?.state().ready === 1,
      );
      if (
        waitForImage &&
        state.elements.some(
          (element) => !element.isDeleted && element.fileId === "remote-file",
        )
      )
        await page.waitForFunction(
          () => window.whiteboardAudit.state().files["remote-file"],
        );
    };
    await ready(false, false);
    await expect.poll(() => typeof releaseClosedImage).toBe("function");
    await delay(3500);
    assert.equal(
      state.previewUploads,
      0,
      "An open page must not generate previews",
    );
    await page.evaluate(() => window.whiteboardAudit.close());
    releaseClosedImage();
    await expect.poll(() => state.previewUploads).toBe(1);
    await page.unroute("**/api/whiteboard-image?**", delayedImage);
    const first = Buffer.from(previewPng);
    await ready();
    await delay(3500);
    assert.equal(
      state.previewUploads,
      1,
      "Reopening unchanged content must not upload another preview",
    );
    await page.evaluate(() => window.whiteboardAudit.close());
    await delay(500);
    assert.equal(
      state.previewUploads,
      1,
      "Closing unchanged content is deduplicated",
    );
    await ready();
    state.previewFailures = 1;
    await page.evaluate(() =>
      window.whiteboardAudit.editElement("remote-base"),
    );
    await expect.poll(() => state.deltas).toBeGreaterThan(0);
    await page.waitForFunction(() => window.quotaRejections > 0);
    await page.evaluate(() => window.whiteboardAudit.close());
    await expect.poll(() => state.previewUploads).toBe(2);
    assert.equal(
      state.previewAttempts,
      3,
      "One failed upload is retried once after closing",
    );
    assert.notDeepEqual(previewPng, first);
    await ready();
    await delay(3500);
    assert.equal(state.previewUploads, 2);
    await page.mouse.click(700, 500);
    await page.evaluate(() => window.whiteboardAudit.clear());
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.keyboard.press(`${modifier}+z`);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.whiteboardAudit
              .state()
              .elements.filter((element) => !element.isDeleted).length,
        ),
      )
      .toBeGreaterThan(0);
    await page.keyboard.press(`${modifier}+Shift+z`);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.whiteboardAudit
              .state()
              .elements.filter((element) => !element.isDeleted).length,
        ),
      )
      .toBe(0);
    await expect
      .poll(() => state.elements.every((element) => element.isDeleted))
      .toBe(true);
    await page.evaluate(() => window.whiteboardAudit.close());
    await expect.poll(() => state.retired).toBe(true);
    assert.equal(
      state.previewUploads,
      2,
      "An empty page must not upload a blank PNG",
    );
    assert.equal(
      previewPng,
      undefined,
      "Retirement removes the disposable preview",
    );
    await ready(true);
    await delay(3500);
    assert.equal(state.previewUploads, 2);
    assert.equal(
      await page.evaluate(() => window.whiteboardAudit.state().tokenRequests),
      0,
    );
    let failedImageRequests = 0;
    await page.route("**/api/whiteboard-image?**", async (route) => {
      if (
        new URL(route.request().url()).searchParams
          .get("url")
          ?.includes("retry-budget")
      ) {
        failedImageRequests++;
        await route.fulfill({ status: 503, body: "temporary image failure" });
      } else await route.continue();
    });
    const image = state.elements.find((element) => element.type === "image");
    const restoredImage = {
      ...image,
      isDeleted: false,
      version: image.version + 1,
      versionNonce: image.versionNonce + 1,
    };
    state.fileRefs["remote-file"] = {
      ...state.fileRefs["remote-file"],
      storageId: "retry-budget",
      url: `${origin}/image.svg?retry-budget`,
    };
    state.elements = mergeWhiteboardElements(state.elements, [restoredImage]);
    updateBuckets([restoredImage]);
    notify();
    await expect.poll(() => failedImageRequests, { timeout: 10_000 }).toBe(3);
    const drawing = state.elements.find((element) => element.type !== "image");
    for (let i = 1; i <= 5; i++) {
      const next = {
        ...drawing,
        version: drawing.version + i,
        versionNonce: drawing.versionNonce + i,
      };
      state.elements = mergeWhiteboardElements(state.elements, [next]);
      updateBuckets([next]);
      notify();
      await page.waitForFunction(
        ({ id, version }) =>
          window.whiteboardAudit
            .state()
            .elements.some(
              (element) => element.id === id && element.version === version,
            ),
        next,
      );
    }
    await delay(500);
    assert.equal(
      failedImageRequests,
      3,
      "Drawing updates must not restart exhausted image retries",
    );
    const recovered = page.waitForResponse(
      (response) =>
        new URL(response.url()).searchParams
          .get("url")
          ?.includes("recovered-image") && response.status() === 200,
    );
    state.fileRefs["remote-file"] = {
      ...state.fileRefs["remote-file"],
      storageId: "recovered-image",
      url: `${origin}/image.svg?recovered-image`,
    };
    state.revision++;
    notify();
    await recovered;
    assert.deepEqual(errors, []);
    results.push({
      notebookPreview: true,
      previewUploads: state.previewUploads,
      previewAttempts: state.previewAttempts,
      retiredAfterErase: state.retired,
      noPreviewsWhileOpen: true,
      closedImageRetry: true,
      fullStorageReload: true,
      imageRetryAttempts: failedImageRequests,
      imageReferenceRecovery: true,
    });
    await context.close();
  }
  for (const readonly of benchmark ||
  notebookPreview ||
  courseMenu ||
  mobileLayout
    ? []
    : [false, true]) {
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
    await expect(
      page.getByRole("button", { name: "Library", exact: true }),
    ).toHaveCount(0);
    if (readonly) {
      await expect(
        page.getByRole("button", { name: "Board", exact: true }),
      ).toHaveCount(0);
    } else {
      const preceding = status.elements;
      for (const viewport of [
        { width: 1100, height: 750 },
        { width: 600, height: 750 },
      ]) {
        await page.setViewportSize(viewport);
        const workspace = page.locator('[data-slot="board-workspace"]');
        const bounds = await workspace.boundingBox();
        await page.getByRole("button", { name: "Board", exact: true }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "sessionBoard" }),
        ).toHaveCount(0);
        await expect(
          page.locator(".excalidraw:not(.whiteboard-ui-overlay)"),
        ).toHaveCount(0);
        assert.deepEqual(
          await workspace.boundingBox(),
          bounds,
          "The gallery must keep the editor's dimensions",
        );
        await expect(
          page.getByRole("textbox", { name: "searchByName" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "newPage" }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Earlier lesson Date" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator(".excalidraw:not(.whiteboard-ui-overlay)"))
          .toHaveCount(1)
          .catch(async (error) => {
            console.error(
              "GALLERY_RETURN",
              await page.evaluate(() => ({
                state: window.whiteboardAudit.state(),
                body: document.body.innerText.slice(0, 2000),
              })),
            );
            throw error;
          });
        await expect
          .poll(() =>
            page.evaluate(() =>
              Object.keys(window.whiteboardAudit.state().files),
            ),
          )
          .toContain("remote-file");
        assert.deepEqual(
          await page.evaluate(() => window.whiteboardAudit.state().elements),
          preceding,
          "Reopening preserves drawings and images",
        );
        assert.deepEqual(await workspace.boundingBox(), bounds);
      }
      const choices = await page.evaluate(
        () => window.whiteboardAudit.state().pageSelections,
      );
      assert.equal(choices.length, 2);
      assert(
        choices.every(
          (choice) =>
            choice.pageId === "browser-page" &&
            choice.roomName === "browser-room" &&
            choice.expectedLiveRoomName === "browser-live-activation",
        ),
      );
      await page.setViewportSize({ width: 1100, height: 750 });
      await page.waitForFunction(
        () =>
          Math.abs(
            window.whiteboardAudit.state().canvasWidth - window.innerWidth,
          ) < 4,
      );
    }
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
    const activeApiCount = await page.evaluate(
      () => window.whiteboardAudit.state().apis.length,
    );
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
      await page
        .waitForFunction(
          () =>
            window.whiteboardAudit
              .state()
              .elements.filter(
                (element) => element.type === "freedraw" && !element.isDeleted,
              ).length === 3,
        )
        .catch(async (error) => {
          console.error(
            "POST_GALLERY_INPUT",
            await page.evaluate(() => ({
              tool: window.whiteboardAudit.state().tool,
              elements: window.whiteboardAudit
                .state()
                .elements.map((element) => ({
                  id: element.id,
                  type: element.type,
                  deleted: element.isDeleted,
                })),
              pointerEvents: document.body.style.pointerEvents,
              hit: document.elementFromPoint(400, 350)?.outerHTML.slice(0, 300),
            })),
          );
          throw error;
        });
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
        activeApiCount,
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
      await page.getByRole("button", { name: "Board", exact: true }).click();
      await expect(
        page.locator(".excalidraw:not(.whiteboard-ui-overlay)"),
      ).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByRole("button", { name: "back", exact: true }).click();
      await expect(
        page.locator(".excalidraw:not(.whiteboard-ui-overlay)"),
      ).toHaveCount(1);
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
      await expect
        .poll(() =>
          page.evaluate(
            () => window.whiteboardAudit.state().files["pending-file"]?.dataURL,
          ),
        )
        .toBe(pendingFile.dataURL);
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
