"use client";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWhiteboardBuckets } from "./use-whiteboard-buckets";
import { useWhiteboardImageRefs } from "./use-whiteboard-image-refs";
import type { WhiteboardEditorProps } from "@/components/whiteboard/whiteboard-editor";

export function useNotebookPageScene(pageId: Id<"courseNotebookPages">) {
  const manifest = useQuery(api.courseNotebook.getManifest, { pageId });
  const scope = JSON.stringify([
    pageId,
    manifest?.sourceId,
    manifest?.generation,
  ]);
  const elements = useWhiteboardBuckets(
    manifest,
    api.courseNotebook.getBucket,
    { pageId },
    scope,
  );
  const fileRefs = useWhiteboardImageRefs(
    elements,
    api.courseNotebookFiles.getFiles,
    { pageId },
  );
  const scene = useMemo<WhiteboardEditorProps["scene"]>(() => {
    if (elements === undefined || fileRefs === undefined) return undefined;
    return {
      elements: elements as unknown as NonNullable<
        WhiteboardEditorProps["scene"]
      >["elements"],
      fileRefs: fileRefs as NonNullable<
        WhiteboardEditorProps["scene"]
      >["fileRefs"],
    };
  }, [elements, fileRefs]);
  return { scene, manifest };
}
