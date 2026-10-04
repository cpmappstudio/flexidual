"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

export function FilePreview({
  file,
  request,
  initialUrl,
  onClose,
  onDownload,
  downloading,
}: {
  file: { id: string; name: string; contentType: string };
  request: (
    params: Record<string, string>,
    init?: RequestInit,
  ) => Promise<Response>;
  initialUrl?: string;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const t = useTranslations("filePreview");
  const [url, setUrl] = useState(initialUrl);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const pdfViewerUnavailable =
    file.contentType === "application/pdf" &&
    typeof navigator !== "undefined" &&
    navigator.pdfViewerEnabled === false;

  useEffect(() => {
    if (pdfViewerUnavailable || (initialUrl && retry === 0)) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void request({ id: file.id }, { signal: controller.signal })
      .then((response) => response.blob())
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
  }, [file.id, initialUrl, pdfViewerUnavailable, request, retry]);

  function retryPreview() {
    setUrl(undefined);
    setFailed(false);
    setRetry((value) => value + 1);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[min(90dvh,900px)] w-[calc(100vw-1rem)] max-w-none min-w-0 flex-col gap-3 overflow-hidden p-4 sm:w-[min(90vw,1100px)] sm:max-w-none sm:p-6"
      >
        <div className="flex min-w-0 items-center gap-3 pr-8">
          <DialogTitle className="min-w-0 flex-1 break-all text-base leading-snug">
            {file.name}
          </DialogTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onDownload}
            disabled={downloading}
            aria-label={`${t("download")}: ${file.name}`}
          >
            <Download className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("download")}</span>
          </Button>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-muted/40">
          {pdfViewerUnavailable ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {t("pdfPreviewUnavailable")}
            </p>
          ) : failed ? (
            <div className="space-y-3 p-4 text-center">
              <p role="alert" className="text-sm text-muted-foreground">
                {t("previewError")}
              </p>
              <Button type="button" variant="outline" onClick={retryPreview}>
                <RotateCcw className="size-4" aria-hidden="true" />
                {t("retryPreview")}
              </Button>
            </div>
          ) : !url ? (
            <div
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Spinner aria-hidden="true" />
              {t("loadingPreview")}
            </div>
          ) : file.contentType === "application/pdf" ? (
            <iframe
              src={url}
              title={file.name}
              className="size-full bg-background"
              onError={() => setFailed(true)}
            />
          ) : (
            <Image
              unoptimized
              src={url}
              alt={file.name}
              width={1200}
              height={900}
              className="max-h-full w-auto max-w-full object-contain"
              onError={() => setFailed(true)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
