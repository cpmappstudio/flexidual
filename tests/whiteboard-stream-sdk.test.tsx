import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { Room as EsmRoom } from "livekit-client";

const require = createRequire(import.meta.url);
const { Room: UmdRoom } =
  require("livekit-client") as typeof import("livekit-client");
const sourcePath = new URL(
  "../node_modules/livekit-client/src/room/Room.ts",
  import.meta.url,
).pathname;
const { default: SourceRoom } = (await import(
  /* @vite-ignore */ sourcePath
)) as { default: typeof EsmRoom };
const topic = "flexidual.whiteboard.scene.v1";

// Inject transport packets only in this SDK regression test; application code uses public readers.
function transport(room: InstanceType<typeof EsmRoom>) {
  const manager = Reflect.get(room, "incomingDataStreamManager");
  manager.setConnected(true);
  const send = (kind: string, value: object) =>
    Reflect.get(room, "handleDataStream")(
      { participantIdentity: "student", value: { case: kind, value } },
      0,
    );
  return {
    header: (streamId: string) =>
      send("streamHeader", {
        streamId,
        topic,
        mimeType: "application/json",
        timestamp: 0n,
        totalLength: 1n,
        contentHeader: { case: "byteHeader", value: {} },
        compression: 0,
      }),
    chunk: (streamId: string, chunkIndex = 0n) =>
      send("streamChunk", {
        streamId,
        chunkIndex,
        content: new Uint8Array([1]),
      }),
    trailer: (streamId: string) =>
      send("streamTrailer", { streamId, attributes: {} }),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

for (const [entry, Room] of [
  ["ESM", EsmRoom],
  ["UMD", UmdRoom],
  ["source", SourceRoom],
] as const) {
  test.each(["abort", "return", "read-error"] as const)(
    `${entry}: early %s cancels the incoming stream and safely drops late packets`,
    async (mode) => {
      const room = new Room();
      const wire = transport(room as EsmRoom);
      const readers: Parameters<
        Parameters<typeof room.registerByteStreamHandler>[1]
      >[0][] = [];
      room.registerByteStreamHandler(topic, (reader) => {
        readers.push(reader);
      });
      const streamId = `whiteboard-${entry}-${mode}`;
      wire.header(streamId);
      if (mode === "abort") {
        const controller = new AbortController();
        controller.abort(new Error("rejected whiteboard stream"));
        await expect(
          readers[0].readAll({ signal: controller.signal }),
        ).rejects.toThrow("rejected whiteboard stream");
      } else if (mode === "return") {
        const iterator = readers[0][Symbol.asyncIterator]();
        await iterator.return?.();
      } else {
        const reading = readers[0].readAll();
        // Missing index zero errors ensureOrderedChunks before a trailer arrives.
        wire.chunk(streamId, 1n);
        await expect(reading).rejects.toThrow("Missing chunk(s)");
      }
      await settle();
      expect(() => wire.chunk(streamId, 2n)).not.toThrow();
      // A same-ID header proves the SDK removed the old controller, without reading private maps.
      expect(() => wire.header(streamId)).not.toThrow();
      expect(readers).toHaveLength(2);
      const recovered = readers[1].readAll();
      wire.chunk(streamId);
      wire.trailer(streamId);
      expect(await recovered).toEqual([new Uint8Array([1])]);
      room.unregisterByteStreamHandler(topic);
    },
  );
}
