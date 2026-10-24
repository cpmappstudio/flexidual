"use client";
import { useCallback } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  WhiteboardEditor,
  type WhiteboardEditorProps,
} from "./whiteboard-editor";
import { useNotebookPageScene } from "@/hooks/use-notebook-page-scene";
import {
  compressWhiteboardImage,
  uploadWhiteboardImage,
} from "@/lib/whiteboard-image";
import { useNotebookPreview } from "@/hooks/use-notebook-preview";

export function NotebookPageEditor({
  pageId,
  canEdit,
  renderTopRightUI,
}: {
  pageId: Id<"courseNotebookPages">;
  canEdit: boolean;
  renderTopRightUI?: WhiteboardEditorProps["renderTopRightUI"];
}) {
  return (
    <NotebookPageEditorSession
      key={`${pageId}:${canEdit}`}
      pageId={pageId}
      canEdit={canEdit}
      renderTopRightUI={renderTopRightUI}
    />
  );
}

function NotebookPageEditorSession({
  pageId,
  canEdit,
  renderTopRightUI,
}: {
  pageId: Id<"courseNotebookPages">;
  canEdit: boolean;
  renderTopRightUI?: WhiteboardEditorProps["renderTopRightUI"];
}) {
  const { scene, manifest } = useNotebookPageScene(pageId);
  const applyDelta = useMutation(api.courseNotebook.applyDelta);
  const { getToken } = useAuth();
  const t = useTranslations("classroom");
  const generation = manifest?.generation;
  const saveDelta = useCallback<WhiteboardEditorProps["saveDelta"]>(
    (bucketId, parts) => {
      if (generation === undefined)
        return Promise.reject(new Error("WHITEBOARD_NOT_READY"));
      return applyDelta({ pageId, bucketId, parts, generation });
    },
    [pageId, generation, applyDelta],
  );
  const uploadImage = useCallback<WhiteboardEditorProps["uploadImage"]>(
    async (file) => {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("PERMISSION_DENIED");
      const { blob, mimeType } = await compressWhiteboardImage(
        file.dataURL,
        file.mimeType,
      );
      return uploadWhiteboardImage(blob, mimeType, token, {
        pageId,
        fileId: file.id,
        created: String(file.created),
      });
    },
    [pageId, getToken],
  );
  const getUploadToken = useCallback(
    () => getToken({ template: "convex" }),
    [getToken],
  );
  const { saved, closed } = useNotebookPreview(pageId, canEdit, getUploadToken);
  return (
    <WhiteboardEditor
      draftKey={`notebook:${pageId}`}
      scene={scene}
      fromLegacy={false}
      saveDelta={saveDelta}
      uploadImage={uploadImage}
      isReadonly={!canEdit}
      onSaved={canEdit ? saved : undefined}
      onClose={canEdit ? closed : undefined}
      renderTopRightUI={renderTopRightUI}
      messages={{
        recovery: t("whiteboardRecoveryFailed"),
        save: t("whiteboardSaveFailed"),
        size: t("whiteboardSizeLimit"),
      }}
    />
  );
}
