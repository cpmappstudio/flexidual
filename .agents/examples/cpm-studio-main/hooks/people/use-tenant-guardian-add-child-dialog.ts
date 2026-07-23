"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorCode } from "@/lib/convex-errors";
import { getImageUploadErrorMessage } from "@/lib/files/image";
import {
  discardStorageUpload,
  uploadStorageFileDraft,
} from "@/lib/files/storage-upload";
import {
  createAcademicProfileDraft,
  normalizeAcademicProfileDraft,
  type NormalizedAcademicProfileDraft,
} from "@/lib/people/academic-person-draft";

const GUARDIAN_CHILD_PROFILE_ID = "guardian-child";

function getAddChildErrorMessage(
  t: ReturnType<typeof useTranslations<"TenantPeople">>,
  commonT: ReturnType<typeof useTranslations<"Common">>,
  error: unknown,
) {
  const code = getErrorCode(error);

  if (code === "PROFILE_NAME_REQUIRED") {
    return t("academicCreateDialog.errors.nameRequired");
  }

  if (code === "CAMPUS_NOT_FOUND") {
    return t("academicCreateDialog.errors.campusNotFound");
  }

  if (code === "GUARDIAN_STUDENT_COUNT_INVALID") {
    return t("academicCreateDialog.errors.studentCountInvalid");
  }

  if (code === "GUARDIAN_RELATIONSHIP_ROLE_MISMATCH") {
    return t("errors.guardianRelationshipRoleMismatch");
  }

  const imageMessage = getImageUploadErrorMessage({
    errorCode: code,
    invalidTypeMessage: commonT("imageUpload.errors.invalidType"),
    tooLargeMessage: commonT("imageUpload.errors.tooLarge"),
    uploadFailedMessage: commonT("imageUpload.errors.uploadFailed"),
    fallbackMessage: "",
  });

  if (imageMessage) {
    return imageMessage;
  }

  return t("genericError");
}

function withProfileImageStorageId(
  profile: NormalizedAcademicProfileDraft,
  imageStorageId: Id<"_storage"> | null,
) {
  return imageStorageId
    ? {
        ...profile,
        imageStorageId,
      }
    : profile;
}

export function useTenantGuardianAddChildDialog({
  guardianOrganizationPersonId,
  onOpenChange,
  open,
  slug,
}: {
  guardianOrganizationPersonId: Id<"organizationPeople">;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const commonT = useTranslations("Common");
  const createGuardianChild = useMutation(
    api.platform.people.createGuardianChild,
  );
  const generateImageUploadUrl = useMutation(
    api.platform.academicPeople.generateImageUploadUrl,
  );
  const discardImageUpload = useMutation(
    api.platform.academicPeople.discardImageUpload,
  );
  const campuses = useQuery(
    api.platform.campuses.listForOrganization,
    open ? { slug } : "skip",
  );
  const [profile, setProfile] = useState(() =>
    createAcademicProfileDraft(GUARDIAN_CHILD_PROFILE_ID),
  );
  const [profileImageFile, setProfileImageFileState] = useState<File | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setProfile(createAcademicProfileDraft(GUARDIAN_CHILD_PROFILE_ID));
    setProfileImageFileState(null);
    setError(null);
    setIsSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      resetForm();
    }
  }

  function setProfileImageFile(_profileId: string, file: File | null) {
    setProfileImageFileState(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    let uploadedStorageId: Id<"_storage"> | null = null;

    try {
      uploadedStorageId = await uploadStorageFileDraft({
        file: profileImageFile,
        generateUploadUrl: () => generateImageUploadUrl({ slug }),
      });

      await createGuardianChild({
        slug,
        guardianOrganizationPersonId,
        profile: withProfileImageStorageId(
          normalizeAcademicProfileDraft(profile),
          uploadedStorageId,
        ),
      });

      toast.success(t("profile.childAdded"));
      resetForm();
      onOpenChange(false);
    } catch (createError) {
      await discardStorageUpload({
        storageId: uploadedStorageId,
        discardUpload: ({ storageId }) =>
          discardImageUpload({ slug, storageId }),
      });
      setError(getAddChildErrorMessage(t, commonT, createError));
      setIsSubmitting(false);
    }
  }

  return {
    profile,
    campuses: campuses ?? [],
    error,
    isLoadingCampuses: open && campuses === undefined,
    isSubmitting,
    handleOpenChange,
    handleSubmit,
    setProfile,
    setProfileImageFile,
  };
}
