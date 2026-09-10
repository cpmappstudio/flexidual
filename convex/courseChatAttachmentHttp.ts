import { fileTypeFromBuffer } from "file-type";
import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_CHAT_FILE_BYTES } from "../lib/chat-attachments";

// Bearer authentication, not cookies. Never return a public storage URL.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-File-Name, X-File-Size",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export const options = httpAction(
  async () => new Response(null, { status: 204, headers }),
);

export const upload = httpAction(async (ctx, request) => {
  let storageId: Id<"_storage"> | undefined;
  try {
    const classId = new URL(request.url).searchParams.get("classId");
    if (!classId)
      return new Response("INVALID_CHAT_FILE", { status: 400, headers });
    const size = Number(request.headers.get("X-File-Size"));
    const contentType = request.headers.get("Content-Type") ?? "";
    const name = decodeURIComponent(request.headers.get("X-File-Name") ?? "");
    const id: Id<"courseChatAttachments"> = await ctx.runMutation(
      internal.courseChatAttachments.reserve,
      { classId: classId as Id<"classes">, name, size, contentType },
    );
    // Bound the actual stream too: client-supplied size is not a security check.
    const reader = request.body?.getReader();
    if (!reader) throw new ConvexError("INVALID_CHAT_FILE");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > size || received > MAX_CHAT_FILE_BYTES) {
        await reader.cancel();
        throw new ConvexError("INVALID_CHAT_FILE");
      }
      chunks.push(new Uint8Array(value));
    }
    if (received !== size) throw new ConvexError("INVALID_CHAT_FILE");
    const blob = new Blob(chunks, { type: contentType });
    const detected = await fileTypeFromBuffer(
      await blob.slice(0, 4100).arrayBuffer(),
    );
    if (detected?.mime !== contentType)
      throw new ConvexError("INVALID_CHAT_FILE");
    storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.courseChatAttachments.complete, {
      id,
      storageId,
    });
    storageId = undefined;
    return Response.json({ id }, { headers });
  } catch (error) {
    if (!(error instanceof ConvexError))
      console.error("Chat attachment upload failed", error);
    if (storageId) await ctx.storage.delete(storageId);
    const code = error instanceof ConvexError ? error.data : "UPLOAD_FAILED";
    return Response.json({ error: code }, { status: 400, headers });
  }
});

export const download = httpAction(async (ctx, request) => {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return new Response(null, { status: 400, headers });
    const file = await ctx.runMutation(internal.courseChatAttachments.read, {
      id: id as Id<"courseChatAttachments">,
    });
    const blob = await ctx.storage.get(file.storageId);
    if (!blob) return new Response(null, { status: 404, headers });
    return new Response(blob, {
      headers: {
        ...headers,
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
    });
  } catch {
    return new Response(null, { status: 403, headers });
  }
});
