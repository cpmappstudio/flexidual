import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_TASK_FILE_BYTES } from "../lib/course-task-files";
import { readCourseTaskUploadBody } from "./model/courseTaskUploadBody";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-File-Name, X-File-Size",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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
    const taskId = params.get("taskId");
    const kind = params.get("kind");
    if (!taskId)
      return Response.json(
        { error: "INVALID_TASK_FILE" },
        { status: 400, headers },
      );
    const size = Number(request.headers.get("X-File-Size"));
    const contentType = request.headers.get("Content-Type") ?? "";
    const name = decodeURIComponent(request.headers.get("X-File-Name") ?? "");
    const id: Id<"courseTaskFiles"> = await ctx.runMutation(
      internal.courseTaskFiles.reserve,
      {
        taskId: taskId as Id<"courseTasks">,
        ...(kind === "material" ? { kind } : {}),
        name,
        size,
        contentType,
      },
    );
    const blob = await readCourseTaskUploadBody(
      request,
      size,
      MAX_TASK_FILE_BYTES,
      contentType,
    );
    if (!blob) throw new ConvexError("INVALID_TASK_FILE");
    storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.courseTaskFiles.complete, { id, storageId });
    storageId = undefined;
    return Response.json({ id }, { headers });
  } catch (error) {
    if (!(error instanceof ConvexError))
      console.error("Task file upload failed", error);
    if (storageId) await ctx.storage.delete(storageId);
    const code = error instanceof ConvexError ? error.data : "UPLOAD_FAILED";
    return Response.json({ error: code }, { status: 400, headers });
  }
});

export const download = httpAction(async (ctx, request) => {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (!id) return new Response(null, { status: 400, headers });
    const file = await ctx.runMutation(internal.courseTaskFiles.read, {
      id: id as Id<"courseTaskFiles">,
      ...(params.get("version")
        ? { version: params.get("version") as Id<"_storage"> }
        : {}),
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

export const correct = httpAction(async (ctx, request) => {
  let storageId: Id<"_storage"> | undefined;
  let uploadId: Id<"courseTaskFiles"> | undefined;
  let fileId: Id<"courseTaskFiles"> | undefined;
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const version = params.get("version");
    const revision = Number(params.get("revision"));
    const saveId = params.get("saveId");
    const size = Number(request.headers.get("X-File-Size"));
    if (
      !id ||
      !version ||
      !saveId ||
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      request.headers.get("Content-Type") !== "application/pdf"
    )
      throw new ConvexError("INVALID_TASK_FILE");
    fileId = id as Id<"courseTaskFiles">;
    const result = await ctx.runMutation(
      internal.courseTaskCorrections.reserve,
      {
        id: id as Id<"courseTaskFiles">,
        version: version as Id<"_storage">,
        revision,
        saveId,
        size,
      },
    );
    if ("savedVersion" in result)
      return Response.json({ version: result.savedVersion }, { headers });
    uploadId = result.id;
    const blob = await readCourseTaskUploadBody(
      request,
      size,
      MAX_TASK_FILE_BYTES,
      "application/pdf",
    );
    if (!blob) throw new ConvexError("INVALID_TASK_FILE");
    storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.courseTaskCorrections.attach, {
      id: uploadId,
      storageId,
    });
    const savedVersion = await ctx.runMutation(
      internal.courseTaskCorrections.complete,
      { id: result.id, storageId },
    );
    storageId = undefined;
    return Response.json({ version: savedVersion }, { headers });
  } catch (error) {
    if (uploadId && fileId)
      await ctx.runMutation(internal.courseTaskCorrections.discard, {
        id: uploadId,
        fileId,
        storageId,
      });
    const code = error instanceof ConvexError ? error.data : "UPLOAD_FAILED";
    return Response.json(
      { error: code },
      { status: code === "TASK_CORRECTION_CONFLICT" ? 409 : 400, headers },
    );
  }
});
