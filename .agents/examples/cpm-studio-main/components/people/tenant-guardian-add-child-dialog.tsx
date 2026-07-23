"use client";

import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { TenantAcademicProfileFormFields } from "@/components/people/tenant-academic-profile-form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { useTenantGuardianAddChildDialog } from "@/hooks/people/use-tenant-guardian-add-child-dialog";

export function TenantGuardianAddChildDialog({
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
  const dialog = useTenantGuardianAddChildDialog({
    guardianOrganizationPersonId,
    onOpenChange,
    open,
    slug,
  });

  return (
    <Dialog open={open} onOpenChange={dialog.handleOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl p-6">
        <DialogTitle className="sr-only">
          {t("academicCreateDialog.studentLegend")}
        </DialogTitle>

        <div className="-mx-4 no-scrollbar max-h-[50vh] overflow-y-auto px-4">
          <form onSubmit={dialog.handleSubmit}>
            <FieldGroup>
              <FieldSet>
                <FieldLegend>
                  {t("academicCreateDialog.studentLegend")}
                </FieldLegend>
                <TenantAcademicProfileFormFields
                  fieldPrefix="guardian-child"
                  isSaving={dialog.isSubmitting}
                  profile={dialog.profile}
                  campuses={dialog.campuses}
                  onChange={dialog.setProfile}
                  onImageFileChange={dialog.setProfileImageFile}
                />
              </FieldSet>

              {dialog.isLoadingCampuses ? (
                <p className="text-sm text-muted-foreground">
                  {t("academicCreateDialog.loadingCampuses")}
                </p>
              ) : null}

              <Button type="submit" disabled={dialog.isSubmitting}>
                {dialog.isSubmitting
                  ? t("profile.addingChild")
                  : t("profile.addChildSubmit")}
              </Button>

              <FieldError>{dialog.error}</FieldError>
            </FieldGroup>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
