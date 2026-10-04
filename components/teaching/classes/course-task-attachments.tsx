"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useState } from "react";
import { Download, Eye, FileText, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { FilePreview } from "@/components/file-preview";
import {
  MAX_TASK_FILE_BYTES,
  MAX_TASK_TOTAL_BYTES,
  TASK_FILE_ACCEPT,
  isValidTaskFile,
  taskFileContentType,
  validTaskFileSet,
} from "@/lib/course-task-files";

export type TaskAttachment = {
  id: Id<"courseTaskFiles">;
  name: string;
  contentType: string;
  size: number;
};

export class TaskFileUploadError extends Error {
  constructor(
    readonly fileName: string,
    readonly code: string,
  ) {
    super(code);
  }
}

export function useTaskFileUploadErrorMessage() {
  const t = useTranslations("courseTasks");
  return (error: TaskFileUploadError) => {
    const reason =
      error.code === "INVALID_TASK_FILE"
        ? t("fileRejected")
        : error.code === "COURSE_CLOSED"
          ? t("courseClosedError")
          : error.code === "TASK_SUBMISSION_CLOSED"
            ? t("submissionClosed")
            : error.code === "NETWORK_ERROR"
              ? t("fileConnectionError")
              : t("fileServerError");
    return t("fileUploadFailed", { name: error.fileName, reason });
  };
}

async function optimizeTaskImage(file: File) {
  if (
    !file.type.startsWith("image/") ||
    typeof createImageBitmap === "undefined"
  )
    return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85),
      );
      if (!blob || blob.type !== "image/webp" || blob.size >= file.size)
        return file;
      return new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, "").slice(0, 175)}.webp`,
        { type: blob.type },
      );
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

export function useTaskFileRequest() {
  const { getToken } = useAuth();
  return useCallback(
    async (params: Record<string, string>, init?: RequestInit) => {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("PERMISSION_DENIED");
      const site =
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
        process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
          /\.convex\.cloud$/,
          ".convex.site",
        );
      if (!site) throw new Error("UPLOAD_FAILED");
      const url = new URL("/course-task-files", site);
      url.search = new URLSearchParams(params).toString();
      const response = await fetch(url, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const error =
          result && typeof result === "object" && "error" in result
            ? result.error
            : null;
        throw new Error(typeof error === "string" ? error : "UPLOAD_FAILED");
      }
      return response;
    },
    [getToken],
  );
}

export async function uploadTaskFiles(
  files: File[],
  taskId: Id<"courseTasks">,
  kind: "material" | "submission",
  request: ReturnType<typeof useTaskFileRequest>,
  onProgress: (completed: number) => void,
  onUploaded?: (id: Id<"courseTaskFiles">) => void,
) {
  const ids: Id<"courseTaskFiles">[] = [];
  for (const file of files) {
    try {
      const contentType = taskFileContentType(file.name);
      if (!contentType) throw new Error("INVALID_TASK_FILE");
      const response = await request(
        { taskId, kind },
        {
          method: "POST",
          body: file,
          headers: {
            "Content-Type": contentType,
            "X-File-Name": encodeURIComponent(file.name),
            "X-File-Size": String(file.size),
          },
        },
      );
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("id" in result) ||
        typeof result.id !== "string"
      )
        throw new Error("UPLOAD_FAILED");
      ids.push(result.id as Id<"courseTaskFiles">);
      onUploaded?.(result.id as Id<"courseTaskFiles">);
      onProgress(ids.length);
    } catch (error) {
      throw new TaskFileUploadError(
        file.name,
        error instanceof TypeError
          ? "NETWORK_ERROR"
          : error instanceof Error
            ? error.message
            : "UPLOAD_FAILED",
      );
    }
  }
  return ids;
}

export function TaskFilePicker({
  files,
  onChange,
  maxFiles,
  existingBytes = 0,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles: number;
  existingBytes?: number;
  disabled?: boolean;
}) {
  const t = useTranslations("courseTasks");
  const [error, setError] = useState<string>();

  async function addFiles(selected: FileList | null) {
    if (!selected) return;
    setError(undefined);
    const next = [...files];
    for (const original of Array.from(selected)) {
      if (original.size > MAX_TASK_TOTAL_BYTES) {
        setError(t("fileTooLargeNamed", { name: original.name }));
        return;
      }
      const file = await optimizeTaskImage(original);
      const type = taskFileContentType(file.name);
      if (
        !type ||
        !isValidTaskFile({ name: file.name, size: file.size, type })
      ) {
        setError(t("invalidFileNamed", { name: original.name }));
        return;
      }
      next.push(file);
    }
    if (!validTaskFileSet([...next, { size: existingBytes }], maxFiles + 1)) {
      setError(
        t("fileLimits", {
          count: maxFiles,
          each: MAX_TASK_FILE_BYTES / 1048576,
          total: MAX_TASK_TOTAL_BYTES / 1048576,
        }),
      );
      return;
    }
    onChange(next);
  }

  return (
    <div className="min-w-0 space-y-2">
      <label
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-2 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary/60 hover:bg-primary/10"}`}
      >
        <Paperclip className="size-4" aria-hidden="true" />
        {t("addFiles")}
        <input
          className="sr-only"
          type="file"
          accept={TASK_FILE_ACCEPT}
          multiple
          disabled={disabled}
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {t("fileLimits", {
          count: maxFiles,
          each: MAX_TASK_FILE_BYTES / 1048576,
          total: MAX_TASK_TOTAL_BYTES / 1048576,
        })}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className="flex w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <FileText className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-all">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={() => onChange(files.filter((_, at) => at !== index))}
            aria-label={t("removeFile", { name: file.name })}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function TaskFileUploadStatus({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const t = useTranslations("courseTasks");
  const isFinalizing = completed >= total;
  const label = isFinalizing
    ? t("finalizingUpload")
    : t("uploadProgress", { current: completed, total });

  return (
    <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
      <div role="status" className="flex items-center gap-2 text-sm">
        <Spinner aria-hidden="true" className="text-primary" />
        <span>{label}</span>
      </div>
      {!isFinalizing && (
        <Progress
          value={completed ? (completed / total) * 100 : undefined}
          aria-label={label}
          indicatorClassName={
            completed
              ? undefined
              : "w-1/3 !translate-x-0 motion-safe:animate-pulse"
          }
        />
      )}
    </div>
  );
}

export function TaskAttachmentList({
  files,
  onRemove,
  disabled,
  plain = false,
}: {
  files: TaskAttachment[];
  onRemove?: (id: Id<"courseTaskFiles">) => void;
  disabled?: boolean;
  plain?: boolean;
}) {
  const t = useTranslations("courseTasks");
  const request = useTaskFileRequest();
  const [downloading, setDownloading] = useState<string>();
  const [previewFile, setPreviewFile] = useState<TaskAttachment>();

  async function download(file: TaskAttachment) {
    setDownloading(file.id);
    try {
      const response = await request({ id: file.id });
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      toast.error(t("downloadError"));
    } finally {
      setDownloading(undefined);
    }
  }

  return (
    <>
      <div className="min-w-0 space-y-2">
        {files.map((file) => {
          const showFileDetails = plain && !onRemove;
          const canPreview =
            file.contentType === "application/pdf" ||
            ["image/jpeg", "image/png", "image/webp"].includes(
              file.contentType,
            );
          return (
            <div
              key={file.id}
              className={
                onRemove
                  ? "flex w-full min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-sm"
                  : "flex w-full max-w-2xl min-w-0 items-center gap-2 rounded-lg py-1"
              }
            >
              <Button
                type="button"
                variant={onRemove || plain ? "ghost" : "outline"}
                className={
                  onRemove
                    ? "h-auto min-w-0 flex-1 shrink justify-start gap-2 whitespace-normal px-1 py-1 text-left"
                    : plain
                      ? "h-auto min-w-0 flex-1 shrink justify-start gap-3 whitespace-normal px-2 py-2 text-left hover:bg-primary/5"
                      : "h-auto max-w-full min-w-0 shrink justify-start gap-2 whitespace-normal text-left"
                }
                disabled={disabled || downloading === file.id}
                onClick={() =>
                  canPreview ? setPreviewFile(file) : void download(file)
                }
                aria-label={`${t(canPreview ? "preview" : "download")}: ${file.name}`}
              >
                {showFileDetails ? (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-5" aria-hidden="true" />
                  </span>
                ) : canPreview ? (
                  <Eye className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Download className="size-4 shrink-0" aria-hidden="true" />
                )}
                {showFileDetails ? (
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span
                      className="line-clamp-2 min-w-0 break-all text-sm font-semibold text-primary"
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {file.name.split(".").at(-1)?.toUpperCase()}
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 break-all">{file.name}</span>
                )}
                {showFileDetails && !canPreview && (
                  <Download
                    className="ml-auto size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </Button>
              {canPreview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:bg-primary/5 hover:text-primary"
                  disabled={disabled || downloading === file.id}
                  onClick={() => void download(file)}
                  aria-label={`${t("download")}: ${file.name}`}
                >
                  <Download className="size-4" aria-hidden="true" />
                </Button>
              )}
              {onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => onRemove(file.id)}
                  aria-label={t("removeFile", { name: file.name })}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {previewFile && (
        <FilePreview
          key={previewFile.id}
          file={previewFile}
          request={request}
          onClose={() => setPreviewFile(undefined)}
          onDownload={() => void download(previewFile)}
          downloading={downloading === previewFile.id}
        />
      )}
    </>
  );
}
