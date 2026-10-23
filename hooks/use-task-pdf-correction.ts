"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_TASK_FILE_BYTES } from "@/lib/course-task-files";
import { useTaskFileRequest } from "@/hooks/use-task-file-request";
import type { TaskPdfViewerHandle } from "@/components/teaching/classes/task-pdf-viewer";

type Document = NonNullable<
  FunctionReturnType<typeof api.courseTaskCorrections.get>
>;
type PendingSave = {
  blob: Blob;
  saveId: string;
  version: string;
  revision: number;
};

export function useTaskPdfCorrection(fileId: string) {
  const t = useTranslations("courseTasks.pdfCorrection");
  const latest = useQuery(api.courseTaskCorrections.get, {
    id: fileId as Id<"courseTaskFiles">,
  });
  const request = useTaskFileRequest();
  const [document, setDocument] = useState<Document>();
  const [url, setUrl] = useState<string>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingSave>();
  const [saveError, setSaveError] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const busy = useRef(false);
  const viewer = useRef<TaskPdfViewerHandle>(null);
  const sourceVersion = document?.version;
  const conflict =
    saveError === "conflict" ||
    Boolean(
      document &&
        latest !== undefined &&
        (!latest ||
          latest.revision !== document.revision ||
          (latest.version !== document.version &&
            !(pending && latest.lastSaveId === pending.saveId))),
    );

  useEffect(() => {
    if (!document && latest) setDocument(latest);
  }, [document, latest]);

  useEffect(() => {
    if (!sourceVersion) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setLoadFailed(false);
    setUrl(undefined);
    setReady(false);
    void request(
      { id: fileId, version: sourceVersion },
      { signal: controller.signal },
    )
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, sourceVersion, request, retry]);

  async function save() {
    if (
      !document ||
      !ready ||
      busy.current ||
      conflict ||
      completed ||
      (!dirty && !pending)
    )
      return;
    busy.current = true;
    setSaving(true);
    setSaveError(undefined);
    try {
      let attempt = pending;
      if (!attempt) {
        const blob = await viewer.current!.exportPdf();
        if (blob.size > MAX_TASK_FILE_BYTES)
          throw new Error("INVALID_TASK_FILE");
        attempt = {
          blob,
          saveId: crypto.randomUUID(),
          version: document.version,
          revision: document.revision,
        };
        setPending(attempt);
      }
      const response = await request(
        {
          id: fileId,
          version: attempt.version,
          revision: String(attempt.revision),
          saveId: attempt.saveId,
        },
        {
          method: "PUT",
          body: attempt.blob,
          headers: {
            "Content-Type": "application/pdf",
            "X-File-Size": String(attempt.blob.size),
          },
        },
      );
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("version" in result) ||
        typeof result.version !== "string"
      )
        throw new Error("UPLOAD_FAILED");
      setPending(undefined);
      setDirty(false);
      setCompleted(true);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code.includes("INVALID_TASK_FILE")) setPending(undefined);
      setSaveError(
        code.includes("CONFLICT") || code.includes("UNAVAILABLE")
          ? "conflict"
          : code.includes("INVALID_TASK_FILE")
            ? "tooLarge"
            : "saveFailed",
      );
    } finally {
      setSaving(false);
      busy.current = false;
    }
  }

  async function downloadCopy() {
    try {
      const blob = pending?.blob ?? (await viewer.current!.exportPdf());
      const localUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = localUrl;
      anchor.download = document!.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(localUrl), 30_000);
    } catch {
      toast.error(t("exportFailed"));
    }
  }

  return {
    document,
    latest,
    url,
    loadFailed,
    ready,
    setReady,
    dirty,
    setDirty,
    saving,
    pending,
    saveError,
    completed,
    conflict,
    viewer,
    save,
    downloadCopy,
    retryLoad: () => setRetry((value) => value + 1),
    reportLoadError: () => setLoadFailed(true),
  };
}
