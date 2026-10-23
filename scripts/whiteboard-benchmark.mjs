import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { createRequire } from "node:module";

const { whiteboardBucketId } = createRequire(import.meta.url)(
  "../lib/whiteboard-elements.ts",
);

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
function distribution(values) {
  assert(values.length, "A measured distribution must have samples");
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) =>
    Math.round(sorted[Math.ceil(p * sorted.length) - 1] * 10) / 10;
  return {
    samples: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: percentile(1),
  };
}
async function cpu(session) {
  const { metrics } = await session.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

/** Sustained edits to one bucket, rather than short strokes spread across hashes. */
export async function runWhiteboardHotBucketBenchmark({
  browser,
  origin,
  reset,
  getState,
  durableOnly = false,
}) {
  reset();
  const participants = [];
  try {
    for (const role of ["teacher", "student-slow"]) {
      const context = await browser.newContext({
        viewport: { width: 1100, height: 750 },
        extraHTTPHeaders: { "x-benchmark-client": role },
      });
      const page = await context.newPage();
      const errors = [];
      participants.push({ context, page, role, errors });
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(
        `${origin}/?load=2000${role === "teacher" ? "" : "&readonly"}${durableOnly ? "&durable-only" : ""}`,
      );
      await page.waitForFunction(
        () => window.whiteboardAudit?.state().ready === 1,
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => Object.keys(window.whiteboardAudit.state().files).length,
          ),
        )
        .toBe(12);
    }
    await pause(500);
    const teacher = participants[0].page;
    const reader = participants[1].page;
    const session = await participants[1].context.newCDPSession(reader);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 80,
      downloadThroughput: 125000,
      uploadThroughput: 62500,
      connectionType: "cellular3g",
    });
    // A small editable shape sharing a dense historical bucket is the failing case.
    const candidates = getState().elements.filter(
      (element) => element.type === "rectangle",
    );
    candidates.sort(
      (a, b) =>
        getState().bucketBytes[whiteboardBucketId(b.id)] -
        getState().bucketBytes[whiteboardBucketId(a.id)],
    );
    const id = candidates[0].id;
    const initialIds = getState()
      .elements.map((element) => element.id)
      .sort();
    const initialImages = Object.keys(getState().files).sort();
    for (const { page } of participants)
      await page.evaluate(
        (id) => window.whiteboardAudit.startMeasurement(id),
        id,
      );
    const before = structuredClone(getState().metrics);
    let latest;
    for (let edit = 0; edit < 120; edit++) {
      latest = await teacher.evaluate(
        (id) => window.whiteboardAudit.editElement(id),
        id,
      );
      // Require distinct durable edits, rather than coalescing 120 UI events into one.
      await expect
        .poll(
          () =>
            getState().elements.find((element) => element.id === id)?.version,
          { timeout: 10000 },
        )
        .toBe(latest);
    }
    await expect
      .poll(
        () =>
          reader.evaluate(
            (id) =>
              window.whiteboardAudit
                .state()
                .elements.find((element) => element.id === id)?.version,
            id,
          ),
        { timeout: 30000 },
      )
      .toBe(latest);
    await pause(500);
    const measurements = await Promise.all(
      participants.map(({ page }) =>
        page.evaluate(() => window.whiteboardAudit.stopMeasurement()),
      ),
    );
    const sent = new Map(
      measurements[0].changes.map((change) => [change.version, change.at]),
    );
    const latency = measurements[1].changes
      .filter((change) => sent.has(change.version))
      .map((change) => change.painted - sent.get(change.version));
    const latencyMs = distribution(latency);
    assert(
      latencyMs.p95 < 1500,
      "Hot-bucket edits must not accumulate multi-second lag in this local slow-network fixture",
    );
    const fullSnapshots =
      (getState().metrics.fullBucketSnapshots["student-slow"] ?? 0) -
      (before.fullBucketSnapshots["student-slow"] ?? 0);
    assert.equal(
      fullSnapshots,
      0,
      "A connected reader must not redownload the historical bucket while checkpointing",
    );
    assert(getState().bucketRevisions[whiteboardBucketId(id)] > 120);
    for (const { page, errors, role } of participants) {
      assert.deepEqual(errors, []);
      const state = await page.evaluate(() => {
        const value = window.whiteboardAudit.state();
        return {
          ids: value.elements.map((element) => element.id).sort(),
          images: Object.keys(value.files).sort(),
          apis: value.apis.length,
          tokenRequests: value.tokenRequests,
        };
      });
      assert.deepEqual(state.ids, initialIds);
      assert.equal(state.images.length, 12);
      assert.equal(
        state.apis,
        2,
        "No editor remount during checkpoint renewal",
      );
      if (role === "student-slow") assert.equal(state.tokenRequests, 0);
    }
    assert.deepEqual(Object.keys(getState().files).sort(), initialImages);
    assert.equal(getState().uploads, 0);
    const report = {
      recordedAt: new Date().toISOString(),
      browser: await browser.version(),
      elements: 2000,
      images: 12,
      distinctEdits: 120,
      bucketId: whiteboardBucketId(id),
      canonicalBucketBytes: getState().bucketBytes[whiteboardBucketId(id)],
      fullBucketSnapshotsDuringEdits: fullSnapshots,
      receivedDurableJsonBytes:
        getState().metrics.responseBytes["student-slow"] -
        before.responseBytes["student-slow"],
      latencyMs,
      finalVersion: latest,
      pageErrors: participants.flatMap((participant) => participant.errors),
      limits:
        "Real Chrome/Excalidraw/hook. Local HTTP/SSE models durable reads/writes (50ms) and a separate live preview stream, NOT actual WebRTC. Reader CPU4x, Chrome 1Mbps/80ms emulation after load; open SSE does not model SFU latency or backpressure. Two animation frames approximate paint. No production or video call tested.",
    };
    await writeFile(
      new URL("../docs/whiteboard-hot-bucket-results.json", import.meta.url),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    for (const { context } of participants) await context.close();
  }
}

/** Local load test, not a substitute for Convex transport or a physical tablet. */
export async function runWhiteboardBenchmark({
  browser,
  origin,
  reset,
  getState,
  durableOnly = false,
}) {
  const results = [];
  for (const elements of [200, 2000]) {
    reset();
    const participants = [];
    try {
      for (const role of [
        "teacher",
        "student-1",
        "student-2",
        "student-slow",
      ]) {
        console.error(`Loading ${elements} elements: ${role}`);
        const context = await browser.newContext({
          viewport: { width: 1100, height: 750 },
          extraHTTPHeaders: { "x-benchmark-client": role },
        });
        await context.route("**/*", (route) =>
          new URL(route.request().url()).origin === origin
            ? route.continue()
            : route.abort(),
        );
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const session = await context.newCDPSession(page);
        await session.send("Performance.enable");
        if (role === "student-slow")
          await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        participants.push({ context, page, role, session, errors });
        const started = Date.now();
        await page.goto(
          `${origin}/?load=${elements}${role === "teacher" ? "" : "&readonly"}${durableOnly ? "&durable-only" : ""}`,
        );
        await page
          .waitForFunction(
            () => window.whiteboardAudit?.state().ready === 1,
            undefined,
            { timeout: 60000 },
          )
          .catch(async (error) => {
            console.error(
              await page.evaluate(() => ({
                state: window.whiteboardAudit?.state(),
                body: document.body.innerText.slice(0, 500),
              })),
              errors,
            );
            throw error;
          });
        await expect
          .poll(
            () =>
              page.evaluate(
                () => Object.keys(window.whiteboardAudit.state().files).length,
              ),
            { timeout: 60000 },
          )
          .toBe(elements > 200 ? 12 : 4);
        participants.at(-1).startupMs = Date.now() - started;
      }
      // Let font/image decode settle before collecting steady-state measurements.
      await pause(1000);
      const slow = participants.at(-1);
      await slow.session.send("Network.enable");
      await slow.session.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 80,
        downloadThroughput: 125000,
        uploadThroughput: 62500,
        connectionType: "cellular3g",
      });
      const initialTraffic = structuredClone(getState().metrics);
      for (const participant of participants) {
        participant.before = await cpu(participant.session);
        await participant.page.evaluate(() =>
          window.whiteboardAudit.startMeasurement(),
        );
      }
      const teacher = participants[0].page;
      await teacher.evaluate(() => window.whiteboardAudit.pencil());
      for (let stroke = 0; stroke < 12; stroke++) {
        const y = 390 + (stroke % 6) * 40;
        await teacher.mouse.move(320, y);
        await teacher.mouse.down();
        for (let point = 1; point <= 24; point++) {
          await teacher.mouse.move(
            320 + point * 13,
            y + Math.sin(point * 0.4) * 12,
          );
          await pause(12);
        }
        await teacher.mouse.up();
      }
      await expect
        .poll(
          () =>
            getState().elements.filter(
              (element) =>
                !element.id.startsWith("load-") && !element.isDeleted,
            ).length,
          { timeout: 60000 },
        )
        .toBe(12);
      for (const participant of participants) {
        await expect
          .poll(
            () =>
              participant.page.evaluate(
                () =>
                  window.whiteboardAudit
                    .state()
                    .elements.filter(
                      (element) =>
                        !element.id.startsWith("load-") && !element.isDeleted,
                    ).length,
              ),
            { timeout: 60000 },
          )
          .toBe(12);
      }
      await expect
        .poll(
          async () => {
            const versions = new Map(
              getState()
                .elements.filter((element) => !element.id.startsWith("load-"))
                .map((element) => [element.id, element.version]),
            );
            const received = await Promise.all(
              participants.map(({ page }) =>
                page.evaluate(() =>
                  window.whiteboardAudit
                    .state()
                    .elements.filter(
                      (element) => !element.id.startsWith("load-"),
                    )
                    .map(({ id, version }) => ({ id, version })),
                ),
              ),
            );
            return received.every(
              (elements) =>
                elements.length === 12 &&
                elements.every(
                  (element) => versions.get(element.id) === element.version,
                ),
            );
          },
          { timeout: 60000 },
        )
        .toBe(true);
      const expected = getState().elements.filter(
        (element) => !element.id.startsWith("load-"),
      );
      await pause(300);
      const traffic = structuredClone(getState().metrics);
      await Promise.all(
        participants.map(async (participant) => {
          participant.measurement = await participant.page.evaluate(() =>
            window.whiteboardAudit.stopMeasurement(),
          );
          participant.after = await cpu(participant.session);
          assert.deepEqual(participant.errors, []);
          const state = await participant.page.evaluate(() => {
            const state = window.whiteboardAudit.state();
            return {
              apis: state.apis,
              visible: state.elements.filter((element) => !element.isDeleted)
                .length,
              tokenRequests: state.tokenRequests,
            };
          });
          assert.equal(
            state.apis.length,
            2,
            "No editor remount during the load test",
          );
          assert.equal(
            state.visible,
            elements + (elements > 200 ? 12 : 4) + 12,
          );
          if (participant.role !== "teacher")
            assert.equal(state.tokenRequests, 0);
        }),
      );
      const sent = new Map(
        participants[0].measurement.changes.map((change) => [
          `${change.id}:${change.version}`,
          change.at,
        ]),
      );
      const teacherStrokes = participants[0].measurement.strokes;
      assert.equal(teacherStrokes.length, 12);
      const teacherFinalRevisionAfterPointerUpMs = distribution(
        expected.map((element, i) => {
          const final = sent.get(`${element.id}:${element.version}`);
          assert(final !== undefined, "The teacher must finalize every stroke");
          return final - teacherStrokes[i].up;
        }),
      );
      const readers = participants.slice(1).map((participant) => {
        const latency = participant.measurement.changes
          .filter((change) => sent.has(`${change.id}:${change.version}`))
          .map(
            (change) =>
              change.painted - sent.get(`${change.id}:${change.version}`),
          );
        const strokeVisibility = teacherStrokes.map((stroke, i) => {
          const id = expected[i].id;
          const first = participant.measurement.changes.find(
            (change) => change.id === id,
          );
          assert(first, `Missing student observation for stroke ${id}`);
          return first.painted - stroke.down;
        });
        const completion = expected.map((element, i) => {
          const change = participant.measurement.changes.find(
            (change) =>
              change.id === element.id && change.version === element.version,
          );
          assert(
            change,
            "The student must receive the final version of every stroke",
          );
          return change.painted - teacherStrokes[i].up;
        });
        return {
          role: participant.role,
          latencyMs: distribution(latency),
          firstStrokeVisibleMs: distribution(strokeVisibility),
          finalVersionAfterPointerUpMs: distribution(completion),
          visibleBeforePointerUp: strokeVisibility.filter(
            (latency, i) =>
              latency < teacherStrokes[i].up - teacherStrokes[i].down,
          ).length,
          receivedDurableJsonBytes:
            traffic.responseBytes[participant.role] -
            (initialTraffic.responseBytes[participant.role] ?? 0),
          receivedPreviewJsonBytes:
            (traffic.liveReceivedBytes[participant.role] ?? 0) -
            (initialTraffic.liveReceivedBytes[participant.role] ?? 0),
        };
      });
      assert.equal(
        getState().uploads,
        0,
        "Existing images must not be reuploaded while drawing",
      );
      const result = {
        elements,
        baselineFreehandPoints: Math.floor(elements * 0.75) * 160,
        images: elements > 200 ? 12 : 4,
        strokes: 12,
        teacherFinalRevisionAfterPointerUpMs,
        durationSeconds:
          Math.round(
            (participants[0].measurement.ended -
              participants[0].measurement.started) /
              100,
          ) / 10,
        initialJsonBytes: initialTraffic.responseBytes,
        initialImageBytes: initialTraffic.imageBytes,
        acceptedDeltaBatches: getState().deltas,
        sentDeltaBytes: traffic.deltaBytes,
        sentPreviewBytes: traffic.liveBytes - initialTraffic.liveBytes,
        sentPreviewBatches: traffic.liveBatches - initialTraffic.liveBatches,
        fullSnapshotSameBatchesModelBytes: traffic.fullSnapshotModelBytes,
        readers,
        resources: participants.map((participant) => ({
          role: participant.role,
          startupMs: participant.startupMs,
          frameIntervalMs: distribution(participant.measurement.frames),
          longTasks: participant.measurement.longTasks.length,
          longTaskMs: Math.round(
            participant.measurement.longTasks.reduce(
              (sum, value) => sum + value,
              0,
            ),
          ),
          rendererTaskCpuMs: Math.round(
            (participant.after.TaskDuration - participant.before.TaskDuration) *
              1000,
          ),
          heapMiB: Math.round(participant.after.JSHeapUsedSize / 1048576),
        })),
        pageErrors: participants.flatMap((participant) => participant.errors),
      };
      results.push(result);
      console.error(
        `Completed ${elements} elements; student p95 latency: ${readers.map((reader) => `${reader.role}=${reader.latencyMs.p95}ms`).join(", ")}`,
      );
    } finally {
      for (const participant of participants) await participant.context.close();
    }
  }
  const report = {
    recordedAt: new Date().toISOString(),
    machine: {
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      ramGiB: Math.round(totalmem() / 1073741824),
      arch: process.arch,
    },
    browser: await browser.version(),
    transportMode: durableOnly ? "durable-only" : "live-preview-and-durable",
    results,
    limits:
      "Real development editor on one desktop. HTTP/SSE models service boundaries: durable reads/writes have 50ms delay; preview uses a separate open SSE stream, NOT actual LiveKit/WebRTC. CPU4x and Chrome 1Mbps/80ms network emulation after load; open SSE does not reproduce WebRTC latency, backpressure or SFU. Paint proxy is two animation frames. No production, invoice, physical tablet or video-call measurement.",
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(
    new URL(
      durableOnly
        ? "../docs/whiteboard-realtime-durable-baseline.json"
        : "../docs/whiteboard-realtime-benchmark-results.json",
      import.meta.url,
    ),
    output,
  );
  console.log(output);
}
