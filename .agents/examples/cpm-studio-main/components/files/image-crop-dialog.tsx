"use client";

import { useEffect, useState } from "react";
import type { Area, Point } from "react-easy-crop";
import Cropper from "react-easy-crop";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createCroppedImageFile } from "@/lib/files/image-crop";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

interface ImageCropDialogProps {
  open: boolean;
  src: string | null;
  fileName: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

type ImageCropState = {
  crop: Point;
  zoom: number;
  croppedAreaPixels: Area | null;
  isCropping: boolean;
};

function createInitialImageCropState(): ImageCropState {
  return {
    crop: { x: 0, y: 0 },
    zoom: 1,
    croppedAreaPixels: null,
    isCropping: false,
  };
}

export function ImageCropDialog({
  open,
  src,
  fileName,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const t = useTranslations("Common");
  const [{ crop, zoom, croppedAreaPixels, isCropping }, setCropState] =
    useState(createInitialImageCropState);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCropState(createInitialImageCropState());
  }, [open, src]);

  async function handleConfirm() {
    if (!src || !croppedAreaPixels) {
      return;
    }

    setCropState((currentState) => ({
      ...currentState,
      isCropping: true,
    }));

    try {
      const croppedFile = await createCroppedImageFile({
        src,
        crop: croppedAreaPixels,
        fileName,
        outputWidth: 512,
        outputHeight: 512,
      });
      onConfirm(croppedFile);
    } catch {
      toast.error(t("imageCropper.errors.cropFailed"));
    } finally {
      setCropState((currentState) => ({
        ...currentState,
        isCropping: false,
      }));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isCropping) {
          onCancel();
        }
      }}
    >
      <DialogContent
        className="max-w-[calc(100%-1rem)] overflow-hidden rounded-3xl p-0 sm:max-w-2xl"
        onEscapeKeyDown={(event) => {
          if (isCropping) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isCropping) {
            event.preventDefault();
          }
        }}
      >
        <DialogTitle className="border-b px-4 py-3 sm:px-6 sm:py-4">
          {t("imageCropper.title")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("imageCropper.description")}
        </DialogDescription>

        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="relative h-[320px] overflow-hidden rounded-2xl bg-neutral-950 sm:h-[420px]">
            {src ? (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={(nextCrop) =>
                  setCropState((currentState) => ({
                    ...currentState,
                    crop: nextCrop,
                  }))
                }
                onZoomChange={(nextZoom) =>
                  setCropState((currentState) => ({
                    ...currentState,
                    zoom: nextZoom,
                  }))
                }
                onCropComplete={(_, croppedPixels) =>
                  setCropState((currentState) => ({
                    ...currentState,
                    croppedAreaPixels: croppedPixels,
                  }))
                }
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t("imageCropper.zoom")}</span>
              <span className="text-muted-foreground">{zoom.toFixed(1)}x</span>
            </div>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={(value) =>
                setCropState((currentState) => ({
                  ...currentState,
                  zoom: value[0] ?? 1,
                }))
              }
            />
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!src || !croppedAreaPixels || isCropping}
          >
            {isCropping ? t("actions.loading") : t("imageCropper.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
