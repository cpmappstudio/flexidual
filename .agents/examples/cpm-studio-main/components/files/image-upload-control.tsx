"use client";

import type { ChangeEvent } from "react";
import { useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  IMAGE_FILE_INPUT_ACCEPT,
  getOptionalImageSrc,
} from "@/lib/files/image";

export function ImageUploadControl({
  imageUrl,
  imageAlt,
  imageFallback,
  uploadLabel,
  removeLabel,
  requirementsText,
  isSaving,
  disabled = false,
  canRemoveImage,
  onSelectImageFile,
  onRemoveImage,
  previewClickable = false,
  previewTriggerLabel,
  avatarClassName,
  avatarImageClassName,
  avatarFallbackClassName,
}: {
  imageUrl: string | null;
  imageAlt: string;
  imageFallback: string;
  uploadLabel: string;
  removeLabel: string;
  requirementsText: string;
  isSaving: boolean;
  disabled?: boolean;
  canRemoveImage: boolean;
  onSelectImageFile: (file: File) => void;
  onRemoveImage: () => void;
  previewClickable?: boolean;
  previewTriggerLabel?: string;
  avatarClassName?: string;
  avatarImageClassName?: string;
  avatarFallbackClassName?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    onSelectImageFile(file);
  }

  const avatar = (
    <Avatar className={avatarClassName}>
      <AvatarImage
        src={getOptionalImageSrc(imageUrl)}
        alt={imageAlt}
        className={avatarImageClassName}
      />
      <AvatarFallback className={avatarFallbackClassName}>
        {imageFallback}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <div className="flex items-center gap-4">
      {previewClickable ? (
        <button
          type="button"
          className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
          disabled={disabled || isSaving}
          onClick={openFilePicker}
          aria-label={previewTriggerLabel ?? uploadLabel}
        >
          {avatar}
        </button>
      ) : (
        avatar
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || isSaving}
            onClick={openFilePicker}
          >
            {uploadLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="px-0 text-destructive hover:bg-transparent hover:text-destructive"
            disabled={disabled || !canRemoveImage || isSaving}
            onClick={onRemoveImage}
          >
            {removeLabel}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{requirementsText}</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_FILE_INPUT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={uploadLabel}
        disabled={disabled || isSaving}
        onChange={handleFileChange}
      />
    </div>
  );
}
