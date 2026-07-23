"use client";

import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ImageCropDialog } from "@/components/files/image-crop-dialog";
import { RequiredFieldLabel } from "@/components/forms/required-field-label";
import { SettingsCard } from "@/components/layout/settings-card";
import { OrganizationImageField } from "@/components/organizations/organization-image-field";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTenantOrganizationProfileForm } from "@/hooks/tenant/use-tenant-organization-profile-form";

type TenantWorkspace = NonNullable<
  FunctionReturnType<typeof api.platform.workspace.getCurrentTenantWorkspace>
>;

export function TenantOrganizationInformationCard({
  canEditImage,
  canEditName,
  organization,
}: {
  canEditImage: boolean;
  canEditName: boolean;
  organization: TenantWorkspace["organization"];
}) {
  const t = useTranslations("TenantTeam");
  const commonT = useTranslations("Common");
  const form = useTenantOrganizationProfileForm({
    canEditImage,
    canEditName,
    organization,
  });

  return (
    <SettingsCard>
      <form className="flex flex-col gap-6" onSubmit={form.handleSubmit}>
        <OrganizationImageField
          imageUrl={form.displayedImageUrl}
          imageAlt={form.imageAlt}
          imageFallback={form.imageFallback}
          imageLabel={t("organizationInformation.imageLabel")}
          uploadLabel={commonT("imageUpload.upload")}
          removeLabel={commonT("imageUpload.remove")}
          requirementsText={commonT("imageUpload.requirements")}
          isSaving={form.isSaving}
          disabled={!form.canEditImage}
          canRemoveImage={form.canRemoveImage}
          error={null}
          onSelectImageFile={form.handleSelectImageFile}
          onRemoveImage={form.handleRemoveImage}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <RequiredFieldLabel htmlFor="tenant-organization-name">
              {t("organizationInformation.nameLabel")}
            </RequiredFieldLabel>
            <FieldContent>
              <Input
                id="tenant-organization-name"
                name="organizationName"
                value={form.name}
                onChange={(event) => form.handleNameChange(event.target.value)}
                autoComplete="organization"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={form.isSaving || !form.canEditName}
                required
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="tenant-organization-slug-preview">
              {t("organizationInformation.slugPreviewLabel")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="tenant-organization-slug-preview"
                name="organizationSlugPreview"
                value={form.slugPreview}
                autoComplete="off"
                spellCheck={false}
                readOnly
                translate="no"
              />
              <FieldDescription>
                {t("organizationInformation.slugPreviewDescription")}
              </FieldDescription>
            </FieldContent>
          </Field>
        </div>
      </form>

      <ImageCropDialog
        open={!!form.imageCropSourceUrl}
        src={form.imageCropSourceUrl}
        fileName={form.imageCropFileName}
        onCancel={form.handleCancelImageCrop}
        onConfirm={form.handleConfirmImageCrop}
      />
    </SettingsCard>
  );
}
