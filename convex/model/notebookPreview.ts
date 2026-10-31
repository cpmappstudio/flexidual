import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  WHITEBOARD_BUCKET_COUNT,
  joinWhiteboardPayload,
  parseWhiteboardElements,
} from "../../lib/whiteboard-elements";
import {
  whiteboardPreviewBucketRevision,
  whiteboardPreviewSignature,
} from "../../lib/whiteboard-preview-revision";
import {
  readWhiteboardBucket,
  writeWhiteboardPreviewSignature,
} from "./whiteboardSceneStorage";

/** Only preview writers and the gallery depend on this mutable state. */
export async function readNotebookPreview(
  ctx: QueryCtx | MutationCtx,
  page: Doc<"courseNotebookPages">,
) {
  const stored = await ctx.db
    .query("courseNotebookPreviews")
    .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
    .unique();
  const source = stored ?? page;
  return {
    id: stored?._id,
    pageId: page._id,
    state: {
      previewStorageId: source.previewStorageId,
      previewVersion: source.previewVersion,
      previewRevision: source.previewRevision,
      previewRequestedRevision: source.previewRequestedRevision,
    },
  };
}

export async function writeNotebookPreview(
  ctx: MutationCtx,
  current: Awaited<ReturnType<typeof readNotebookPreview>>,
  changes: Partial<Awaited<ReturnType<typeof readNotebookPreview>>["state"]>,
) {
  if (current.id)
    await ctx.db.patch("courseNotebookPreviews", current.id, changes);
  else
    await ctx.db.insert("courseNotebookPreviews", {
      pageId: current.pageId,
      ...current.state,
      ...changes,
    });
}

/** Validate small signatures; old pages prepare one canonical bucket per call. */
export async function notebookPreviewSnapshot(
  ctx: MutationCtx,
  pageId: Id<"courseNotebookPages">,
  prepare = false,
) {
  const manifest = await ctx.db
    .query("whiteboardSceneManifests")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
  if (!manifest) throw new ConvexError("NOTEBOOK_PAGE_NOT_FOUND");
  const stored = await ctx.db
    .query("whiteboardScenePreviewSignatures")
    .withIndex("by_manifestId_and_bucketId", (q) =>
      q.eq("manifestId", manifest._id),
    )
    .take(WHITEBOARD_BUCKET_COUNT);
  const signatures: [number, string][] = [];
  let hasContent = false;
  for (const id of manifest.bucketIds) {
    const stamp = stored.find((row) => row.bucketId === id);
    if (
      stamp?.generation === manifest.generation &&
      stamp.hasContent !== undefined
    ) {
      signatures.push([id, stamp.signature]);
      hasContent ||= stamp.hasContent;
      continue;
    }
    if (!prepare) throw new ConvexError("STALE_NOTEBOOK_PREVIEW");
    // Existing pages initialize at most one canonical bucket (<=8 MiB) per
    // transaction. This is metadata only; preserve every drawing and delta.
    const parts = await readWhiteboardBucket(ctx, manifest._id, id);
    const elements = parseWhiteboardElements(
      joinWhiteboardPayload(parts.map((part) => part.jsonPart)),
    );
    await writeWhiteboardPreviewSignature(
      ctx,
      manifest,
      id,
      await whiteboardPreviewBucketRevision(elements),
      elements.some((element) => !element.isDeleted),
    );
    return undefined;
  }
  return { revision: await whiteboardPreviewSignature(signatures), hasContent };
}
