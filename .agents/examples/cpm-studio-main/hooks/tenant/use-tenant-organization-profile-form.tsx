"use client";

import { type FormEvent, useEffect, useEffectEvent, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TenantUnsavedChangesToast } from "@/components/people/tenant-unsaved-changes-toast";
import type { AppLocale } from "@/i18n/routing";
import { useRouter } from "@/i18n/navigation";
import { getErrorCode } from "@/lib/convex-errors";
import {
  getImageFallbackLabel,
  getImageUploadErrorMessage,
} from "@/lib/files/image";
import {
  discardStorageUpload,
  uploadStorageFileDraft,
} from "@/lib/files/storage-upload";
import { ROUTES } from "@/lib/navigation/routes";
import { getTenantHostUrl } from "@/lib/tenancy/domain";
import { normalizeTenantSlug } from "@/lib/tenancy/slug";
import { useRemovableImageUploadDraft } from "@/hooks/use-removable-image-upload-draft";

type TenantWorkspace = NonNullable<
  FunctionReturnType<typeof api.platform.workspace.getCurrentTenantWorkspace>
>;
type TenantOrganization = TenantWorkspace["organization"];

const UNSAVED_ORGANIZATION_PROFILE_TOAST_ID_PREFIX =
  "tenant-organization-profile-unsaved";

function getOrganizationUpdateErrorMessage({
  commonT,
  error,
  t,
}: {
  commonT: ReturnType<typeof useTranslations<"Common">>;
  error: unknown;
  t: ReturnType<typeof useTranslations<"TenantTeam">>;
}) {
  const errorCode = getErrorCode(error);

  if (errorCode === "ORGANIZATION_NAME_REQUIRED") {
    return t("organizationInformation.errors.nameRequired");
  }

  if (errorCode === "ORGANIZATION_NAME_INVALID") {
    return t("organizationInformation.errors.nameInvalid");
  }

  if (errorCode === "ORGANIZATION_SLUG_UNAVAILABLE") {
    return t("organizationInformation.errors.slugUnavailable");
  }

  return getImageUploadErrorMessage({
    errorCode,
    invalidTypeMessage: commonT("imageUpload.errors.invalidType"),
    tooLargeMessage: commonT("imageUpload.errors.tooLarge"),
    uploadFailedMessage: commonT("imageUpload.errors.uploadFailed"),
    fallbackMessage: t("genericError"),
  });
}

export function useTenantOrganizationProfileForm({
  canEditImage,
  canEditName,
  organization,
}: {
  canEditImage: boolean;
  canEditName: boolean;
  organization: TenantOrganization;
}) {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const t = useTranslations("TenantTeam");
  const commonT = useTranslations("Common");
  const updateOrganization = useMutation(
    api.organizations.updateForOrganization,
  );
  const generateImageUploadUrl = useMutation(
    api.organizations.generateTenantImageUploadUrl,
  );
  const discardImageUpload = useMutation(
    api.organizations.discardTenantImageUpload,
  );
  const [baselineName, setBaselineName] = useState(organization.name);
  const [baselineSlug, setBaselineSlug] = useState(organization.slug);
  const [name, setName] = useState(organization.name);
  const [isSaving, setIsSaving] = useState(false);
  const imageDraft = useRemovableImageUploadDraft({
    imageUrl: organization.imageUrl ?? null,
    hasRemovableImage: !!organization.imageUrl,
  });
  const normalizedName = name.trim();
  const slugPreview = normalizeTenantSlug(normalizedName);
  const hasNameChanges = canEditName && normalizedName !== baselineName;
  const hasImageChanges = canEditImage && imageDraft.hasPendingImageChanges;
  const hasChanges = hasNameChanges || hasImageChanges;
  const unsavedToastId = `${UNSAVED_ORGANIZATION_PROFILE_TOAST_ID_PREFIX}:${organization._id}`;
  const imageAlt = normalizedName || organization.name;
  const imageFallback = getImageFallbackLabel({
    name: normalizedName || organization.name,
    fallback: "IN",
  });

  function resetChanges() {
    setName(baselineName);
    imageDraft.clearImageDraft();
    toast.dismiss(unsavedToastId);
  }

  async function saveChanges() {
    if (isSaving || !hasChanges) {
      return;
    }

    if (!normalizedName) {
      toast.error(t("organizationInformation.errors.nameRequired"));
      return;
    }

    setIsSaving(true);
    let uploadedStorageId: Id<"_storage"> | null = null;

    try {
      uploadedStorageId = canEditImage
        ? await uploadStorageFileDraft({
            file: imageDraft.selectedImageFile,
            generateUploadUrl: () =>
              generateImageUploadUrl({ slug: baselineSlug }),
          })
        : null;

      const updatedOrganization = await updateOrganization({
        slug: baselineSlug,
        name: canEditName ? name : baselineName,
        imageChange:
          uploadedStorageId !== null
            ? {
                kind: "set",
                storageId: uploadedStorageId,
              }
            : canEditImage && imageDraft.shouldRemoveImage
              ? { kind: "remove" }
              : { kind: "keep" },
      });

      setBaselineName(updatedOrganization.name);
      setBaselineSlug(updatedOrganization.slug);
      setName(updatedOrganization.name);
      imageDraft.clearImageDraft();
      toast.dismiss(unsavedToastId);
      toast.success(t("organizationInformation.saved"));

      if (updatedOrganization.slug !== baselineSlug) {
        window.location.assign(
          getTenantHostUrl(
            updatedOrganization.slug,
            locale,
            ROUTES.tenant.teamSettings(updatedOrganization.slug),
          ),
        );
        return;
      }

      router.refresh();
    } catch (error) {
      await discardStorageUpload({
        storageId: uploadedStorageId,
        discardUpload: ({ storageId }) =>
          discardImageUpload({ slug: baselineSlug, storageId }),
      });
      toast.error(getOrganizationUpdateErrorMessage({ commonT, error, t }));
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveChanges();
  }

  const resetChangesEvent = useEffectEvent(() => {
    resetChanges();
  });
  const saveChangesEvent = useEffectEvent(() => {
    void saveChanges();
  });
  const resetToCurrentOrganizationEvent = useEffectEvent(() => {
    setBaselineName(organization.name);
    setBaselineSlug(organization.slug);
    setName(organization.name);
    imageDraft.clearImageDraft();
    toast.dismiss(unsavedToastId);
  });

  useEffect(() => {
    resetToCurrentOrganizationEvent();
  }, [organization._id]);

  useEffect(() => {
    if (!hasChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasChanges]);

  useEffect(() => {
    if (!hasChanges) {
      toast.dismiss(unsavedToastId);
      return;
    }

    toast.custom(
      () => (
        <TenantUnsavedChangesToast
          isSaving={isSaving}
          message={t("organizationInformation.unsavedChanges")}
          resetLabel={t("organizationInformation.resetChanges")}
          saveLabel={t("organizationInformation.saveChanges")}
          onReset={resetChangesEvent}
          onSave={saveChangesEvent}
        />
      ),
      {
        id: unsavedToastId,
        duration: Infinity,
        position: "bottom-center",
      },
    );

    return () => {
      toast.dismiss(unsavedToastId);
    };
  }, [hasChanges, isSaving, t, unsavedToastId]);

  return {
    name,
    slugPreview,
    imageAlt,
    imageFallback,
    displayedImageUrl: imageDraft.displayedImageUrl,
    canEditImage,
    canEditName,
    canRemoveImage: canEditImage && imageDraft.canRemoveImage,
    imageCropSourceUrl: imageDraft.imageCropSourceUrl,
    imageCropFileName: imageDraft.imageCropFileName,
    isSaving: isSaving || !!imageDraft.imageCropSourceUrl,
    handleSubmit,
    handleNameChange: canEditName ? setName : () => {},
    handleSelectImageFile: canEditImage
      ? imageDraft.handleSelectImageFile
      : () => {},
    handleRemoveImage: canEditImage ? imageDraft.handleRemoveImage : () => {},
    handleCancelImageCrop: imageDraft.handleCancelImageCrop,
    handleConfirmImageCrop: imageDraft.handleConfirmImageCrop,
  };
}
