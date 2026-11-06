import { createFile } from "mp4box";
import { validVideoDuration } from "../video-progress";

const CHUNK_BYTES = 256 * 1024;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const MAX_BOXES = 4096;
const MAX_DURATION_BOX_BYTES = 128;
export class VideoDurationUnavailable extends Error {}

type Container = "root" | "moov" | "mvex" | "trak" | "mdia";

/** Decode only a fixed-size duration box using MP4Box's public APIs. */
function parseDurationBox<T extends "mvhd" | "mdhd" | "mehd">(
  type: T,
  bytes: Uint8Array,
) {
  const file = createFile(false);
  let failure: unknown;
  file.onError = (error) => {
    failure = error;
  };
  // Buffer.slice() is a view into a pooled allocation, not an owned ArrayBuffer.
  const buffer = Uint8Array.from(bytes).buffer as ArrayBuffer & {
    fileStart: number;
  };
  buffer.fileStart = 0;
  // A zero-sized child extends to its parent's end; the isolated parser has no parent.
  if (new DataView(buffer).getUint32(0) === 0)
    new DataView(buffer).setUint32(0, buffer.byteLength);
  try {
    // Never pass moov/trak/sample tables: appendBuffer would expand every sample.
    file.appendBuffer(buffer);
    const box = file.getBox(type);
    if (failure || !box || (box.version !== 0 && box.version !== 1))
      throw new Error("Invalid duration header");
    return box;
  } catch (cause) {
    throw new VideoDurationUnavailable("Cannot read MP4 duration", { cause });
  }
}

/** Walk ISO BMFF box boundaries, skipping media and sample tables without parsing them. */
export async function readStoredVideoDuration(
  size: number,
  read: (start: number, end: number) => Promise<Uint8Array>,
) {
  if (!Number.isSafeInteger(size) || size < 8)
    throw new VideoDurationUnavailable("Invalid MP4 size");
  let cache: Uint8Array = new Uint8Array();
  let cacheStart = 0;
  let readBytes = 0;
  let boxCount = 0;
  let movie: { duration: number; timescale: number } | undefined;
  let fragmentDuration: number | undefined;
  let hasFragments = false;
  let trackDurationMs = 0;

  async function bytesAt(start: number, length: number) {
    if (start < cacheStart || start + length > cacheStart + cache.length) {
      const lengthToRead = Math.min(
        CHUNK_BYTES,
        size - start,
        MAX_METADATA_BYTES - readBytes,
      );
      if (lengthToRead < length)
        throw new VideoDurationUnavailable("MP4 metadata budget exhausted");
      // Transport errors deliberately remain retryable, not duration-unavailable.
      cache = await read(start, start + lengthToRead - 1);
      if (cache.length !== lengthToRead)
        throw new Error("Incomplete metadata range");
      cacheStart = start;
      readBytes += cache.length;
    }
    return cache.subarray(start - cacheStart, start - cacheStart + length);
  }

  async function walk(
    start: number,
    end: number,
    parent: Container,
  ): Promise<void> {
    for (let offset = start; offset < end; ) {
      if (++boxCount > MAX_BOXES || end - offset < 8)
        throw new VideoDurationUnavailable("Invalid or excessive MP4 boxes");
      const header = await bytesAt(offset, Math.min(16, end - offset));
      const view = new DataView(
        header.buffer,
        header.byteOffset,
        header.byteLength,
      );
      const type = String.fromCharCode(...header.subarray(4, 8));
      const size32 = view.getUint32(0);
      let headerSize = size32 === 1 ? 16 : 8;
      if (header.length < headerSize)
        throw new VideoDurationUnavailable("Truncated MP4 header");
      const boxSize =
        size32 === 0
          ? end - offset
          : size32 === 1
            ? Number(view.getBigUint64(8))
            : size32;
      if (type === "uuid") headerSize += 16;
      if (
        !Number.isSafeInteger(boxSize) ||
        boxSize < headerSize ||
        boxSize > end - offset
      )
        throw new VideoDurationUnavailable("Invalid MP4 box bounds");
      const next = offset + boxSize;
      if (parent === "root" && type === "moov") {
        await walk(offset + headerSize, next, "moov");
        return;
      }
      if (
        (parent === "moov" && (type === "mvex" || type === "trak")) ||
        (parent === "trak" && type === "mdia")
      ) {
        if (type === "mvex") hasFragments = true;
        await walk(offset + headerSize, next, type as Container);
      } else if (
        (parent === "moov" && type === "mvhd") ||
        (parent === "mvex" && type === "mehd") ||
        (parent === "mdia" && type === "mdhd")
      ) {
        if (boxSize > MAX_DURATION_BOX_BYTES)
          throw new VideoDurationUnavailable("Oversized MP4 duration header");
        const bytes = await bytesAt(offset, boxSize);
        if (type === "mvhd") movie ??= parseDurationBox("mvhd", bytes);
        else if (type === "mehd")
          fragmentDuration ??= parseDurationBox(
            "mehd",
            bytes,
          ).fragment_duration;
        else {
          const track = parseDurationBox("mdhd", bytes);
          if (track.timescale > 0)
            trackDurationMs = Math.max(
              trackDurationMs,
              (1000 * track.duration) / track.timescale,
            );
        }
      }
      offset = next;
    }
  }

  await walk(0, size, "root");
  if (!movie || movie.timescale <= 0)
    throw new VideoDurationUnavailable("Invalid MP4 timescale");
  let milliseconds = (1000 * movie.duration) / movie.timescale;
  if (hasFragments)
    milliseconds = Math.max(
      milliseconds,
      fragmentDuration === undefined
        ? trackDurationMs
        : (1000 * fragmentDuration) / movie.timescale,
    );
  if (!validVideoDuration(milliseconds))
    throw new VideoDurationUnavailable("Invalid MP4 duration");
  return Math.max(1, Math.round(milliseconds));
}
