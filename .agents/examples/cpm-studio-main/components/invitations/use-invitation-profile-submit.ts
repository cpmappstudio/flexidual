"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  discardStorageUpload,
  uploadStorageFileDraft,
} from "@/lib/files/storage-upload";

export function useInvitationProfileSubmit() {
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const discardAvatarUpload = useMutation(api.users.discardAvatarUpload);
  const saveProfile = useMutation(api.users.saveProfile);

  return async function submitInviteProfile(args: {
    firstName: string;
    lastName: string;
    selectedAvatarFile: File | null;
    shouldRemoveAvatar: boolean;
  }) {
    let uploadedStorageId: Id<"_storage"> | null = null;

    try {
      uploadedStorageId = await uploadStorageFileDraft({
        file: args.selectedAvatarFile,
        generateUploadUrl: generateAvatarUploadUrl,
      });

      await saveProfile({
        firstName: args.firstName,
        lastName: args.lastName,
        avatarChange:
          uploadedStorageId !== null
            ? { kind: "set", storageId: uploadedStorageId }
            : args.shouldRemoveAvatar
              ? { kind: "remove" }
              : { kind: "keep" },
      });
    } catch (error) {
      await discardStorageUpload({
        storageId: uploadedStorageId,
        discardUpload: discardAvatarUpload,
      });
      throw error;
    }
  };
}
