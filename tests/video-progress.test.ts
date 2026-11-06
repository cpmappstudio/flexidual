import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readStoredVideoDuration,
  VideoDurationUnavailable,
} from "../lib/server/video-duration";
import { invalidDurationMp4, sampleHeavyMp4, trackedMp4 } from "./fixtures/mp4";
import {
  addPlayedRange,
  coverageSize,
  firstUnwatchedMs,
  mergeCoverage,
  subtractCoverage,
  validCoverage,
  watchedMilliseconds,
} from "../lib/video-progress";

function box(type: string, ...payload: Uint8Array[]) {
  const data = Buffer.concat([Buffer.alloc(8), ...payload]);
  data.writeUInt32BE(data.length);
  data.write(type, 4);
  return data;
}

function durationHeader(type: "mvhd" | "mdhd") {
  const bytes = Buffer.from(trackedMp4());
  const start = bytes.indexOf(type) - 4;
  return bytes.subarray(start, start + bytes.readUInt32BE(start));
}

function durationOf(bytes: Uint8Array) {
  return readStoredVideoDuration(bytes.length, async (start, end) =>
    bytes.slice(start, end + 1),
  );
}

test("compact coverage is bounded, unions repeats and counts a final partial second without crediting skips", () => {
  const a = new Uint8Array(coverageSize(10_500));
  const b = new Uint8Array(a.length);
  addPlayedRange(a, 0, 5000, 10_500);
  addPlayedRange(b, 8000, 10_500, 10_500);
  const both = mergeCoverage(a, b);
  assert.equal(watchedMilliseconds(both, 10_500), 7500);
  assert.equal(watchedMilliseconds(mergeCoverage(both, a), 10_500), 7500);
  assert.equal(watchedMilliseconds(subtractCoverage(both, a), 10_500), 2500);
  assert.equal(validCoverage(both, 10_500), true);
  assert.equal(coverageSize(12 * 3600_000), 5400);
});

test("range edges round inward rather than inflating sub-second fragments", () => {
  const a = new Uint8Array(coverageSize(10_000));
  addPlayedRange(a, 100, 900, 10_000);
  assert.equal(watchedMilliseconds(a, 10_000), 0);
  addPlayedRange(a, 100, 2100, 10_000);
  assert.equal(watchedMilliseconds(a, 10_000), 1000);
  assert.equal(validCoverage(new Uint8Array([255, 255]), 10_000), false);
});

test("resume finds the first uncovered second rather than a percentage or the furthest watched position", () => {
  const duration = 10_500;
  const coverage = new Uint8Array(coverageSize(duration));
  assert.equal(firstUnwatchedMs(coverage, duration), 0);
  addPlayedRange(coverage, 0, 2500, duration);
  addPlayedRange(coverage, 5000, duration, duration);
  assert.equal(firstUnwatchedMs(coverage, duration), 2000);
  addPlayedRange(coverage, 2000, 10_000, duration);
  assert.equal(firstUnwatchedMs(coverage, duration), null);
  const partial = new Uint8Array(coverageSize(duration));
  addPlayedRange(partial, 0, 10_499, duration);
  assert.equal(firstUnwatchedMs(partial, duration), 10_000);
  addPlayedRange(partial, 10_000, duration, duration);
  assert.equal(firstUnwatchedMs(partial, duration), null);
});

test("uses the official MP4 parser for real movie metadata rather than trusting the upload declaration", async () => {
  const bytes = trackedMp4();
  assert.equal(
    await readStoredVideoDuration(bytes.length, async (start, end) =>
      bytes.slice(start, end + 1),
    ),
    42_000,
  );
  await assert.rejects(
    () => readStoredVideoDuration(1024, async () => new Uint8Array(0)),
    /Incomplete/,
  );
});

test("metadata parsing skips large media payloads when moov is at the end", async () => {
  const metadata = trackedMp4();
  const mdatSize = 50 * 1024 * 1024;
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, mdatSize);
  header.set(new TextEncoder().encode("mdat"), 4);
  const starts: number[] = [];
  let total = 0;
  const duration = await readStoredVideoDuration(
    mdatSize + metadata.length,
    async (start, end) => {
      starts.push(start);
      total += end - start + 1;
      const result = new Uint8Array(end - start + 1);
      if (start === 0) result.set(header);
      if (start >= mdatSize) result.set(metadata.subarray(start - mdatSize));
      return result;
    },
  );
  assert.equal(duration, 42_000);
  assert.deepEqual(starts, [0, mdatSize]);
  assert.ok(total < 300_000);
});

test("invalid duration metadata is terminal, not a raw parser exception", async () => {
  const bytes = invalidDurationMp4();
  await assert.rejects(
    () =>
      readStoredVideoDuration(bytes.length, async (start, end) =>
        bytes.slice(start, end + 1),
      ),
    VideoDurationUnavailable,
  );
});

test("duration parsing never expands sample tables, including untrusted sample counts", async () => {
  const bytes = sampleHeavyMp4();
  assert.equal(
    await readStoredVideoDuration(bytes.length, async (start, end) =>
      bytes.slice(start, end + 1),
    ),
    42_000,
  );
});

test("sample-heavy metadata fits in an isolated 96 MiB heap without sample-sized allocations", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--expose-gc",
      "--max-old-space-size=96",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
      const load = async (path) => { const m = await import(path); return m.default ?? m; };
      const { readStoredVideoDuration } = await load('./lib/server/video-duration.ts');
      const { sampleHeavyMp4 } = await load('./tests/fixtures/mp4.ts');
      const bytes = sampleHeavyMp4();
      global.gc();
      const before = process.memoryUsage().heapUsed;
      const duration = await readStoredVideoDuration(bytes.length, async (s, e) => bytes.slice(s, e + 1));
      console.log(JSON.stringify({duration, heapGrowth: process.memoryUsage().heapUsed - before}));
    `,
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 10_000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const measured = JSON.parse(result.stdout);
  assert.equal(measured.duration, 42_000);
  assert.ok(measured.heapGrowth < 16 * 1024 * 1024, JSON.stringify(measured));
});

test("storage failures remain retryable rather than permanently disabling progress", async () => {
  const failure = new Error("Storage temporarily offline");
  await assert.rejects(
    () =>
      readStoredVideoDuration(1024, async () => {
        throw failure;
      }),
    (error) => error === failure,
  );
});

test("movie header versions 0 and 1 keep the same duration, including 64-bit box sizes", async () => {
  const v0 = durationHeader("mvhd");
  const v1 = Buffer.alloc(v0.length + 12);
  v1.writeUInt32BE(v1.length);
  v1.write("mvhd", 4);
  v1[8] = 1;
  v1.writeUInt32BE(1000, 28);
  v1.writeBigUInt64BE(42_000n, 32);
  v0.copy(v1, 40, 28);
  const extended = Buffer.concat([Buffer.alloc(16), v1.subarray(8)]);
  extended.writeUInt32BE(1);
  extended.write("mvhd", 4);
  extended.writeBigUInt64BE(BigInt(extended.length), 8);
  for (const header of [v0, v1, extended])
    assert.equal(await durationOf(box("moov", header)), 42_000);
});

test("fragmented movies use mehd duration or the track timescale fallback without sample expansion", async () => {
  const mvhd = Buffer.from(durationHeader("mvhd"));
  mvhd.writeUInt32BE(0, 24);
  const mdhd = Buffer.from(durationHeader("mdhd"));
  mdhd.writeUInt32BE(2000, 20);
  mdhd.writeUInt32BE(100_000, 24);
  const track = box("trak", box("mdia", mdhd));
  assert.equal(await durationOf(box("moov", mvhd, box("mvex"), track)), 50_000);
  for (const version of [0, 1]) {
    const payload = Buffer.alloc(version === 1 ? 12 : 8);
    payload[0] = version;
    if (version) payload.writeBigUInt64BE(73_500n, 4);
    else payload.writeUInt32BE(73_500, 4);
    assert.equal(
      await durationOf(
        box("moov", box("mvex", box("mehd", payload)), track, mvhd),
      ),
      73_500,
    );
  }
});

test("box headers split across ranges, zero-sized children and extended containers are handled safely", async () => {
  const movie = box("moov", durationHeader("mvhd"));
  const padding = Buffer.alloc(256 * 1024 - 4);
  padding.writeUInt32BE(padding.length);
  padding.write("free", 4);
  assert.equal(await durationOf(Buffer.concat([padding, movie])), 42_000);
  const zeroChild = Buffer.from(durationHeader("mvhd"));
  zeroChild.writeUInt32BE(0);
  const zeroMovie = box("moov", zeroChild);
  zeroMovie.writeUInt32BE(0);
  assert.equal(await durationOf(zeroMovie), 42_000);
  const extended = Buffer.concat([Buffer.alloc(16), movie.subarray(8)]);
  extended.writeUInt32BE(1);
  extended.write("moov", 4);
  extended.writeBigUInt64BE(BigInt(extended.length), 8);
  assert.equal(await durationOf(extended), 42_000);
});

test("malformed bounds, unsafe sizes, truncated or unsupported duration headers fail closed", async () => {
  const header = durationHeader("mvhd");
  const unsupported = Buffer.from(header);
  unsupported[8] = 2;
  const truncated = Buffer.from(header.subarray(0, 24));
  truncated.writeUInt32BE(truncated.length);
  const oversized = box("moov", box("mvhd", Buffer.alloc(1024)));
  const badBounds = box("moov", header);
  badBounds.writeUInt32BE(badBounds.length + 1);
  const unsafe = Buffer.alloc(16);
  unsafe.writeUInt32BE(1);
  unsafe.write("free", 4);
  unsafe.writeBigUInt64BE(2n ** 63n, 8);
  for (const bytes of [
    box("moov", unsupported),
    box("moov", truncated),
    oversized,
    badBounds,
    unsafe,
    Buffer.alloc(7),
  ])
    await assert.rejects(() => durationOf(bytes), VideoDurationUnavailable);
});

test("metadata without a usable duration or beyond the supported duration never becomes progress", async () => {
  for (const value of [0, 12 * 3600_000 + 1, 0xffffffff]) {
    const header = Buffer.from(durationHeader("mvhd"));
    header.writeUInt32BE(value, 24);
    await assert.rejects(
      () => durationOf(box("moov", header)),
      VideoDurationUnavailable,
    );
  }
  await assert.rejects(() => durationOf(box("free")), VideoDurationUnavailable);
});

test("read and box-count budgets bound files with excessive headers or distant metadata", async () => {
  const tooMany = Buffer.concat(
    Array.from({ length: 4097 }, () => box("free")),
  );
  await assert.rejects(() => durationOf(tooMany), VideoDurationUnavailable);
  const chunk = 256 * 1024;
  const size = chunk * 40;
  let readBytes = 0;
  let calls = 0;
  await assert.rejects(
    () =>
      readStoredVideoDuration(size, async (start, end) => {
        calls++;
        readBytes += end - start + 1;
        assert.ok(end - start + 1 <= chunk);
        const bytes = Buffer.alloc(end - start + 1);
        bytes.writeUInt32BE(chunk);
        bytes.write("free", 4);
        return bytes;
      }),
    VideoDurationUnavailable,
  );
  assert.equal(calls, 32);
  assert.equal(readBytes, 8 * 1024 * 1024);
});
