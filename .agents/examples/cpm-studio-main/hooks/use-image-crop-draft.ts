"use client";

import { useEffect, useState } from "react";

export function useImageCropDraft() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<
    string | null
  >(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("");

  useEffect(() => {
    return () => {
      if (selectedFilePreviewUrl) {
        URL.revokeObjectURL(selectedFilePreviewUrl);
      }
    };
  }, [selectedFilePreviewUrl]);

  useEffect(() => {
    return () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    };
  }, [cropSourceUrl]);

  function clearPendingPreview() {
    if (selectedFilePreviewUrl) {
      URL.revokeObjectURL(selectedFilePreviewUrl);
    }
    setSelectedFilePreviewUrl(null);
  }

  function clearPendingCropSource() {
    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl);
    }
    setCropSourceUrl(null);
    setCropFileName("");
  }

  function startCrop(file: File) {
    clearPendingCropSource();
    setCropSourceUrl(URL.createObjectURL(file));
    setCropFileName(file.name);
  }

  function cancelCrop() {
    clearPendingCropSource();
  }

  function confirmCrop(file: File) {
    clearPendingPreview();
    setSelectedFile(file);
    setSelectedFilePreviewUrl(URL.createObjectURL(file));
    clearPendingCropSource();
  }

  function clearDraft() {
    clearPendingCropSource();
    clearPendingPreview();
    setSelectedFile(null);
  }

  return {
    selectedFile,
    selectedFilePreviewUrl,
    cropSourceUrl,
    cropFileName,
    startCrop,
    cancelCrop,
    confirmCrop,
    clearDraft,
  };
}
