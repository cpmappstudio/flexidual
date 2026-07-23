"use client";

import { useTranslations } from "next-intl";
import { ImageCropDialog } from "@/components/files/image-crop-dialog";
import { ResourceCreateTileButton } from "@/components/resources/resource-collection";
import { OrganizationImageField } from "@/components/organizations/organization-image-field";
import { usePlatformCreateOrganizationDialog } from "@/components/platform/use-platform-create-organization-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function PlatformCreateOrganizationDialog() {
  const t = useTranslations("PlatformAdmin");
  const commonT = useTranslations("Common");
  const nameErrorId = "platform-organization-name-error";
  const formErrorId = "platform-organization-form-error";
  const {
    open,
    name,
    nameError,
    imageError,
    formError,
    isSubmitting,
    displayedImageUrl,
    canRemoveImage,
    imageCropSourceUrl,
    imageCropFileName,
    organizationName,
    isImageBusy,
    imageFallback,
    handleOpenChange,
    handleSubmit,
    handleNameChange,
    handleCancelImageCrop,
    handleConfirmImageCrop,
    handleImageSelection,
    handleImageRemove,
  } = usePlatformCreateOrganizationDialog();
  const imageAlt = organizationName || t("nameLabel");

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogTrigger asChild>
        <ResourceCreateTileButton label={t("createCard")} />
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createDialogTitle")}</DialogTitle>
          <DialogDescription>{t("createDialogDescription")}</DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <FieldGroup>
            <OrganizationImageField
              imageUrl={displayedImageUrl}
              imageAlt={imageAlt}
              imageFallback={imageFallback}
              imageLabel={t("imageLabel")}
              uploadLabel={commonT("imageUpload.upload")}
              removeLabel={commonT("imageUpload.remove")}
              requirementsText={commonT("imageUpload.requirements")}
              isSaving={isImageBusy}
              canRemoveImage={canRemoveImage}
              error={imageError}
              onSelectImageFile={handleImageSelection}
              onRemoveImage={handleImageRemove}
            />
            <Field data-invalid={nameError ? true : undefined}>
              <FieldLabel htmlFor="organization-name">
                {t("nameLabel")}
              </FieldLabel>
              <FieldContent>
                <Input
                  id="organization-name"
                  name="name"
                  value={name}
                  onChange={(event) => handleNameChange(event.target.value)}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? nameErrorId : undefined}
                  placeholder={t("namePlaceholder")}
                  autoComplete="organization"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                <FieldError id={nameErrorId}>{nameError}</FieldError>
              </FieldContent>
            </Field>
            <FieldError id={formErrorId}>
              {formError ? `${t("errorPrefix")}: ${formError}` : null}
            </FieldError>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>

        <ImageCropDialog
          open={!!imageCropSourceUrl}
          src={imageCropSourceUrl}
          fileName={imageCropFileName}
          onCancel={handleCancelImageCrop}
          onConfirm={handleConfirmImageCrop}
        />
      </DialogContent>
    </Dialog>
  );
}
