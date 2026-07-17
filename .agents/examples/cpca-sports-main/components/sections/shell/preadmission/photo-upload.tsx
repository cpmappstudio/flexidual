"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import {
  APPLICATION_PHOTO_ACCEPT,
  ApplicationPhotoError,
  prepareApplicationPhoto,
} from "@/lib/images/application-photo";

interface PhotoUploadProps {
  value?: Id<"_storage"> | null;
  onChange: (storageId: Id<"_storage"> | null) => void;
  required?: boolean;
}

export function PhotoUpload({ value, onChange, required }: PhotoUploadProps) {
  const t = useTranslations("preadmission.core.photo");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const getErrorMessage = (error: unknown) => {
    if (error instanceof ApplicationPhotoError) {
      if (error.code === "invalidType") {
        return t("invalidType");
      }
      if (error.code === "maxSize") {
        return t("maxSize");
      }
    }

    return t("uploadFailed");
  };

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);
    let localPreviewUrl: string | null = null;

    try {
      const optimizedPhoto = await prepareApplicationPhoto(file);
      localPreviewUrl = URL.createObjectURL(optimizedPhoto);
      const uploadUrl = await generateUploadUrl();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": optimizedPhoto.type },
        body: optimizedPhoto,
      });

      if (!result.ok) {
        throw new Error(t("uploadFailed"));
      }

      const { storageId } = await result.json();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(localPreviewUrl);
      onChange(storageId);
    } catch (err) {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
      setError(getErrorMessage(err));
      console.error("[PhotoUpload] Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="photo">
          {t("label")} {required && <span className="text-destructive">*</span>}
        </Label>
        <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
      </div>

      <div className="flex items-start gap-4">
        {previewUrl && (
          <div className="relative w-24 h-24 rounded-md overflow-hidden border shrink-0">
            <Image
              src={previewUrl}
              alt="Uploaded photo"
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        )}

        <div className="flex-1 space-y-2">
          <Input
            id="photo"
            type="file"
            accept={APPLICATION_PHOTO_ACCEPT}
            onChange={handleFileChange}
            disabled={isUploading}
            required={required && !value}
          />
          {isUploading && (
            <p className="text-sm text-muted-foreground">{t("uploading")}</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {value && !isUploading && (
            <p className="text-sm text-green-600">{t("uploaded")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
