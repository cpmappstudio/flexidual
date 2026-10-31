import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_CHAT_FILE_BYTES } from "../lib/chat-attachments";
import { readVerifiedUploadBody } from "./model/fileUploadBody";

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
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId)
      return new Response("INVALID_CHAT_FILE", { status: 400, headers });
    const size = Number(request.headers.get("X-File-Size"));
    const contentType = request.headers.get("Content-Type") ?? "";
    const name = decodeURIComponent(request.headers.get("X-File-Name") ?? "");
    const id: Id<"eventChatAttachments"> = await ctx.runMutation(
      internal.eventChatAttachments.reserve,
      { eventId: eventId as Id<"events">, name, size, contentType },
    );
    const blob = await readVerifiedUploadBody(
      request,
      size,
      MAX_CHAT_FILE_BYTES,
      contentType,
    );
    if (!blob) throw new ConvexError("INVALID_CHAT_FILE");
    storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.eventChatAttachments.complete, {
      id,
      storageId,
    });
    storageId = undefined;
    return Response.json({ id }, { headers });
  } catch (error) {
    if (!(error instanceof ConvexError))
      console.error("Event chat attachment upload failed", error);
    if (storageId) await ctx.storage.delete(storageId);
    const code = error instanceof ConvexError ? error.data : "UPLOAD_FAILED";
    return Response.json({ error: code }, { status: 400, headers });
  }
});

export const download = httpAction(async (ctx, request) => {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return new Response(null, { status: 400, headers });
    const file = await ctx.runMutation(internal.eventChatAttachments.read, {
      id: id as Id<"eventChatAttachments">,
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
