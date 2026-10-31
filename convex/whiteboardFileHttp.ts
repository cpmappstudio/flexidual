import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_WHITEBOARD_FILE_SIZE } from "./whiteboardFiles";
import { readVerifiedUploadBody } from "./model/fileUploadBody";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Size",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export const options = httpAction(
  async () => new Response(null, { status: 204, headers }),
);

export const upload = httpAction(async (ctx, request) => {
  let storageId: Id<"_storage"> | undefined;
  try {
    const params = new URL(request.url).searchParams;
    const roomName = params.get("roomName");
    const pageId = params.get("pageId");
    const expectedLiveRoomName = params.get("expectedLiveRoomName");
    const fileId = params.get("fileId");
    const created = Number(params.get("created"));
    const size = Number(request.headers.get("X-File-Size"));
    const contentType = request.headers.get("Content-Type") ?? "";
    if (
      (!pageId && (!roomName || !expectedLiveRoomName)) ||
      (pageId && (roomName || expectedLiveRoomName)) ||
      !fileId ||
      !params.has("created")
    )
      throw new ConvexError("INVALID_WHITEBOARD_FILE");
    const args = {
      fileId,
      created,
      size,
      contentType,
    };
    const notebookArgs = pageId
      ? {
          ...args,
          pageId: pageId as Id<"courseNotebookPages">,
          ...(params.has("previewVersion")
            ? { previewVersion: Number(params.get("previewVersion")) }
            : {}),
        }
      : undefined;
    const liveArgs = {
      ...args,
      roomName: roomName!,
      expectedLiveRoomName: expectedLiveRoomName!,
    };
    if (notebookArgs)
      await ctx.runMutation(
        internal.courseNotebookFiles.authorizeUpload,
        notebookArgs,
      );
    else
      await ctx.runMutation(internal.whiteboardFiles.authorizeUpload, liveArgs);
    const blob = await readVerifiedUploadBody(
      request,
      size,
      MAX_WHITEBOARD_FILE_SIZE,
      contentType,
      { allowSvg: true, allowImageAliases: true },
    );
    if (!blob) throw new ConvexError("INVALID_WHITEBOARD_FILE");
    storageId = await ctx.storage.store(blob);
    const ref = notebookArgs
      ? await ctx.runMutation(internal.courseNotebookFiles.complete, {
          ...notebookArgs,
          storageId,
        })
      : await ctx.runMutation(internal.whiteboardFiles.complete, {
          ...liveArgs,
          storageId,
        });
    if (ref.storageId !== storageId) await ctx.storage.delete(storageId);
    storageId = undefined;
    return Response.json(ref, { headers });
  } catch (error) {
    if (storageId) await ctx.storage.delete(storageId);
    if (!(error instanceof ConvexError))
      console.error("Whiteboard image upload failed", error);
    return Response.json(
      { error: error instanceof ConvexError ? error.data : "UPLOAD_FAILED" },
      { status: 400, headers },
    );
  }
});
