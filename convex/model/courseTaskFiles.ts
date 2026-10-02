import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import {
  MAX_TASK_MATERIAL_FILES,
  validTaskFileSet,
} from "../../lib/course-task-files";

export async function deleteCourseTaskFile(
  ctx: MutationCtx,
  file: Doc<"courseTaskFiles">,
) {
  if (file.storageId) await ctx.storage.delete(file.storageId);
  await ctx.db.delete("courseTaskFiles", file._id);
}

export async function replaceCourseTaskMaterials(
  ctx: MutationCtx,
  taskId: Id<"courseTasks">,
  userId: Id<"users">,
  fileIds: Id<"courseTaskFiles">[],
  now: number,
) {
  if (
    fileIds.length > MAX_TASK_MATERIAL_FILES ||
    new Set(fileIds).size !== fileIds.length
  )
    throw new ConvexError("INVALID_TASK_FILES");
  const files = await Promise.all(
    fileIds.map((id) => ctx.db.get("courseTaskFiles", id)),
  );
  if (
    files.some(
      (file) =>
        !file ||
        file.taskId !== taskId ||
        file.kind !== "material" ||
        !file.storageId ||
        (file.state === "staged" &&
          (file.uploadedBy !== userId || (file.expiresAt ?? 0) <= now)),
    ) ||
    !validTaskFileSet(
      files as Doc<"courseTaskFiles">[],
      MAX_TASK_MATERIAL_FILES,
    )
  )
    throw new ConvexError("INVALID_TASK_FILES");
  const previous = await ctx.db
    .query("courseTaskFiles")
    .withIndex("by_taskId_and_kind_and_state", (q) =>
      q.eq("taskId", taskId).eq("kind", "material").eq("state", "active"),
    )
    .collect();
  const selected = new Set(fileIds);
  for (const file of previous) {
    if (!selected.has(file._id)) await deleteCourseTaskFile(ctx, file);
  }
  for (const file of files) {
    if (file!.state === "staged") {
      await ctx.db.patch("courseTaskFiles", file!._id, {
        state: "active",
        expiresAt: undefined,
      });
    }
  }
}
