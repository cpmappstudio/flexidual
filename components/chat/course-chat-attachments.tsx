"use client";

import { useAuth } from "@clerk/nextjs";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Download, FileText, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { chatTextParts } from "@/lib/chat-attachments";

export async function optimizeChatImage(file: File): Promise<File> {
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
        {
          type: blob.type,
        },
      );
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

export function useChatFileRequest() {
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
      const url = new URL("/course-chat-files", site);
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

export function ChatMessageText({
  body,
  enabled,
}: {
  body: string;
  enabled: boolean;
}) {
  if (!enabled) return body;
  return chatTextParts(body).map((part, index) =>
    part.href ? (
      <span key={index}>
        <a
          href={part.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline underline-offset-2"
        >
          {part.label}
        </a>
        {part.suffix}
      </span>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

export function ChatFilePreview({
  file,
  onRemove,
  disabled,
  state = "idle",
}: {
  file: File;
  onRemove?: () => void;
  disabled?: boolean;
  state?: ComponentProps<typeof Attachment>["state"];
}) {
  const t = useTranslations("classroom");
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return (
    <Attachment
      state={state}
      size="sm"
      className="w-full min-w-0 flex-nowrap rounded-md bg-muted/40 text-inherit"
    >
      <AttachmentMedia
        variant={url ? "image" : "icon"}
        className="bg-transparent text-inherit"
      >
        {/* Authenticated/local blobs must not go through the public image optimizer. */}
        {url ? (
          <Image
            unoptimized
            width={40}
            height={40}
            src={url}
            alt=""
            className="size-10 shrink-0 rounded object-cover"
          />
        ) : (
          <FileText className="size-5 shrink-0" />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle className="font-normal">{file.name}</AttachmentTitle>
      </AttachmentContent>
      {onRemove && (
        <AttachmentActions>
          <AttachmentAction
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            disabled={disabled}
            onClick={onRemove}
            aria-label={t("removeAttachment")}
          >
            <X className="size-4" />
          </AttachmentAction>
        </AttachmentActions>
      )}
    </Attachment>
  );
}

export function ChatAttachment({
  file,
}: {
  file: {
    id: Id<"courseChatAttachments">;
    name: string;
    contentType: string;
    size: number;
  };
}) {
  const t = useTranslations("classroom");
  const request = useChatFileRequest();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const isImage = file.contentType.startsWith("image/");
  useEffect(() => {
    if (!isImage || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isImage]);
  useEffect(() => {
    if (!isImage || !visible) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setFailed(false);
    void request({ id: file.id }, { signal: controller.signal })
      .then((r) => r.blob())
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, isImage, visible, request, retry]);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await request({ id: file.id });
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.name;
      link.click();
      // Allow the browser to start consuming the download before releasing it.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      toast.error(t("attachmentUnavailable"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div ref={ref} className="my-1 w-60 max-w-full">
      {isImage ? (
        <Attachment
          orientation="vertical"
          className="w-full rounded-md border-0 bg-transparent p-0 has-data-[slot=attachment-media]:p-0"
        >
          <AttachmentMedia
            variant="image"
            className="aspect-[4/3] rounded-md bg-background/20 text-inherit"
          >
            {url && !failed ? (
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="h-full w-full"
                    aria-label={t("openAttachment", { name: file.name })}
                  >
                    <Image
                      unoptimized
                      width={960}
                      height={720}
                      src={url}
                      alt={file.name}
                      onError={() => setFailed(true)}
                      className="h-full w-full object-contain"
                    />
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-3xl">
                  <DialogTitle className="break-all text-sm">
                    {file.name}
                  </DialogTitle>
                  <Image
                    unoptimized
                    width={960}
                    height={720}
                    src={url}
                    alt={file.name}
                    className="max-h-[75dvh] w-full object-contain"
                  />
                </DialogContent>
              </Dialog>
            ) : failed ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRetry((n) => n + 1)}
                aria-label={t("retryAttachment")}
              >
                <RotateCcw className="size-4" />
                {t("retryAttachment")}
              </Button>
            ) : (
              <LoaderCircle
                aria-label={t("loadingAttachment")}
                className="size-5 animate-spin"
              />
            )}
          </AttachmentMedia>
        </Attachment>
      ) : null}
      {!isImage && (
        <Attachment
          size="sm"
          className="w-full min-w-0 flex-nowrap rounded-md border-0 bg-background/10 text-inherit has-[>button]:hover:bg-background/20"
        >
          <AttachmentMedia className="bg-transparent text-inherit">
            <FileText aria-hidden="true" className="size-5 shrink-0" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle className="font-normal">
              {file.name}
            </AttachmentTitle>
            <AttachmentDescription className="text-inherit opacity-75">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </AttachmentDescription>
          </AttachmentContent>
          <AttachmentTrigger
            disabled={downloading}
            onClick={() => void download()}
            aria-label={t("downloadAttachment", { name: file.name })}
          />
          <AttachmentActions>
            <AttachmentAction
              size="icon-sm"
              disabled={downloading}
              onClick={() => void download()}
              aria-label={t("downloadAttachment", { name: file.name })}
            >
              {downloading ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="ml-1 size-5 shrink-0 animate-spin"
                />
              ) : (
                <Download aria-hidden="true" className="ml-1 size-5 shrink-0" />
              )}
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      )}
    </div>
  );
}
