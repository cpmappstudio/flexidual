"use client";
import { useCallback, useEffect, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { WhiteboardEditorProps } from "@/components/whiteboard/whiteboard-editor";
import { uploadWhiteboardImage } from "@/lib/whiteboard-image";
import { reportRuntimeError } from "@/lib/error-tracking";
import { whiteboardPreviewRevision } from "@/lib/whiteboard-preview-revision";
import { WHITEBOARD_BUCKET_COUNT } from "@/lib/whiteboard-elements";

type Snapshot = Parameters<NonNullable<WhiteboardEditorProps["onSaved"]>>[1];
type PreviewJob = Snapshot & {
  revision: string;
  attempts: number;
  signature?: string;
  version?: number;
  blob?: Blob;
};

/** Same confirmed, bounded thumbnail policy inside and outside a live classroom. */
export function useNotebookPreview(
  pageId: Id<"courseNotebookPages"> | undefined,
  canEdit: boolean,
  getToken?: () => Promise<string | null>,
) {
  const beginPreview = useMutation(api.courseNotebookFiles.beginPreview);
  const state = useMemo<{
    pageId: typeof pageId;
    canEdit: boolean;
    closedRevision?: string;
    running: boolean;
    pending?: PreviewJob;
    completed?: string;
    timer?: ReturnType<typeof setTimeout>;
    callbacks?: {
      beginPreview: typeof beginPreview;
      getToken: typeof getToken;
    };
  }>(() => ({ pageId, canEdit, running: false }), [pageId, canEdit]);
  useEffect(() => {
    state.callbacks = { beginPreview, getToken };
  }, [state, beginPreview, getToken]);

  const flush = useCallback(
    async function runPreview() {
      const { pageId, canEdit } = state;
      clearTimeout(state.timer);
      state.timer = undefined;
      const job = state.pending;
      if (
        !pageId ||
        !canEdit ||
        state.running ||
        !job ||
        job.attempts >= 3 ||
        state.closedRevision !== job.revision
      )
        return;
      state.running = true;
      job.attempts++;
      try {
        // The editor revision contains every element; persist only its bounded signature.
        job.signature ??= await whiteboardPreviewRevision(job.elements);
        if (state.pending !== job) return;
        const reserve = () =>
          state.callbacks!.beginPreview({
            pageId,
            revision: job.signature!,
            expectedVersion: job.version,
            retireIfEmpty: !job.elements.some((element) => !element.isDeleted),
          });
        let version = await reserve();
        // Pre-signature pages prepare one bounded bucket per request, once.
        // Preparation is not a failed upload and does not consume retry attempts.
        for (
          let prepared = 0;
          typeof version === "object" && version !== null;
          prepared++
        ) {
          if (state.pending !== job) return;
          if (prepared >= WHITEBOARD_BUCKET_COUNT)
            throw new Error("INVALID_NOTEBOOK_PREVIEW_PREPARATION");
          version = await reserve();
        }
        if (version !== null) {
          job.version = version;
          if (state.pending !== job) return;
          if (!job.blob) {
            const { exportToBlob } = await import("@excalidraw/excalidraw");
            job.blob = await exportToBlob({
              elements: job.elements.filter((element) => !element.isDeleted),
              files: job.files,
              appState: {
                exportWithDarkMode: false,
                viewBackgroundColor: "#ffffff",
              },
              maxWidthOrHeight: 480,
              mimeType: "image/png",
            });
          }
          if (state.pending !== job) return;
          const blob = job.blob;
          if (!blob) throw new Error("PREVIEW_EXPORT_FAILED");
          if (blob.size > 256 * 1024) throw new Error("PREVIEW_TOO_LARGE");
          const token = await state.callbacks?.getToken?.();
          if (!token) throw new Error("PERMISSION_DENIED");
          if (state.pending !== job) return;
          await uploadWhiteboardImage(blob, "image/png", token, {
            pageId,
            fileId: "preview",
            created: String(Date.now()),
            previewVersion: String(version),
          });
        }
        state.completed = job.revision;
        if (state.pending === job) state.pending = undefined;
      } catch (error) {
        reportRuntimeError(error, { operation: "notebook.preview" });
        if (
          /ArgumentValidationError|PERMISSION_DENIED|STALE_NOTEBOOK_PREVIEW|INVALID_|NOT_FOUND|ARCHIVED|TOO_LARGE/.test(
            String(error),
          )
        )
          job.attempts = 3;
        if (state.pending === job && job.attempts < 3)
          state.timer = setTimeout(
            () => void runPreview(),
            job.attempts * 1000,
          );
      } finally {
        state.running = false;
        if (
          state.pending &&
          state.pending !== job &&
          state.closedRevision === state.pending.revision
        )
          state.timer = setTimeout(() => void runPreview(), 0);
      }
    },
    [state],
  );

  const saved = useCallback<NonNullable<WhiteboardEditorProps["onSaved"]>>(
    (revision, snapshot) => {
      if (
        !pageId ||
        !canEdit ||
        state.completed === revision ||
        state.pending?.revision === revision
      )
        return;
      state.pending = {
        ...snapshot,
        revision,
        attempts: 0,
      };
      clearTimeout(state.timer);
      if (!state.running && state.closedRevision === revision) void flush();
    },
    [pageId, canEdit, state, flush],
  );
  const closed = useCallback<NonNullable<WhiteboardEditorProps["onClose"]>>(
    (revision) => {
      state.closedRevision = revision;
      void flush();
    },
    [state, flush],
  );
  return { saved, closed };
}
