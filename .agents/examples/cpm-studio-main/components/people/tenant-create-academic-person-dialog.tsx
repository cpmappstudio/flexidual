"use client";

import { useTranslations } from "next-intl";
import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RequiredFieldLabel } from "@/components/forms/required-field-label";
import { TenantAcademicProfileFormFields } from "@/components/people/tenant-academic-profile-form-fields";
import { TenantGuardianStudentProfilesFieldSet } from "@/components/people/tenant-guardian-student-profiles-field-set";
import type { TenantOrganizationPersonRole } from "@/components/people/tenant-people.types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTenantCreateAcademicPersonDialog } from "@/hooks/people/use-tenant-create-academic-person-dialog";
import { PROFILE_PIN_INPUT_PROPS } from "@/lib/people/profile-pin";

export function TenantCreateAcademicPersonDialog({
  slug,
  role,
  triggerLabel,
  title,
}: {
  slug: string;
  role: Extract<TenantOrganizationPersonRole, "student" | "teacher">;
  triggerLabel: string;
  title: string;
}) {
  const t = useTranslations("TenantPeople");
  const dialog = useTenantCreateAcademicPersonDialog({ slug, role });
  const isGuardianStudent = role === "student" && dialog.isGuardianManaged;

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="-mx-4 no-scrollbar max-h-[50vh] overflow-y-auto px-4">
          <form onSubmit={dialog.handleSubmit}>
            <FieldGroup>
              {role === "student" ? (
                <FieldLabel
                  className="border-border/70 has-data-checked:bg-amber-500/10 dark:has-data-checked:bg-amber-500/10"
                  htmlFor="academic-person-guardian-managed"
                >
                  <Field orientation="horizontal">
                    <Checkbox
                      id="academic-person-guardian-managed"
                      checked={dialog.isGuardianManaged}
                      className="data-checked:border-amber-500/40 data-checked:bg-amber-500/10 data-checked:text-amber-700 dark:data-checked:bg-amber-500/10 dark:data-checked:text-amber-300"
                      onCheckedChange={(nextChecked) =>
                        dialog.setIsGuardianManaged(nextChecked === true)
                      }
                    />
                    <FieldContent>
                      <FieldTitle className="gap-1.5">
                        <HugeiconsIcon
                          icon={UserGroupIcon}
                          strokeWidth={2}
                          data-icon="inline-start"
                          aria-hidden="true"
                          className="size-3.5 text-amber-700 dark:text-amber-300"
                        />
                        {t("academicCreateDialog.guardianManagedLabel")}
                      </FieldTitle>
                      <FieldDescription>
                        {t("academicCreateDialog.guardianManagedDescription")}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              ) : null}

              <FieldSet>
                <FieldLegend>
                  {isGuardianStudent
                    ? t("academicCreateDialog.guardianLegend")
                    : t("academicCreateDialog.accountLegend")}
                </FieldLegend>

                {isGuardianStudent ? (
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <RequiredFieldLabel htmlFor="guardian-first-name">
                        {t("createDialog.firstNameLabel")}
                      </RequiredFieldLabel>
                      <Input
                        id="guardian-first-name"
                        name="guardianFirstName"
                        value={dialog.guardianFirstName}
                        onChange={(event) =>
                          dialog.setGuardianFirstName(event.target.value)
                        }
                        autoComplete="off"
                        required
                      />
                    </Field>
                    <Field>
                      <RequiredFieldLabel htmlFor="guardian-last-name">
                        {t("createDialog.lastNameLabel")}
                      </RequiredFieldLabel>
                      <Input
                        id="guardian-last-name"
                        name="guardianLastName"
                        value={dialog.guardianLastName}
                        onChange={(event) =>
                          dialog.setGuardianLastName(event.target.value)
                        }
                        autoComplete="off"
                        required
                      />
                    </Field>
                  </FieldGroup>
                ) : null}

                <FieldGroup>
                  <Field>
                    <RequiredFieldLabel htmlFor="academic-person-email">
                      {t("academicCreateDialog.emailLabel")}
                    </RequiredFieldLabel>
                    <Input
                      id="academic-person-email"
                      name="email"
                      type="email"
                      value={dialog.accountEmail}
                      onChange={(event) =>
                        dialog.setAccountEmail(event.target.value)
                      }
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                  </Field>

                  <Field>
                    <RequiredFieldLabel htmlFor="academic-person-password">
                      {t("academicCreateDialog.passwordLabel")}
                    </RequiredFieldLabel>
                    <Input
                      id="academic-person-password"
                      name="password"
                      type="password"
                      value={dialog.password}
                      onChange={(event) =>
                        dialog.setPassword(event.target.value)
                      }
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </Field>

                  {isGuardianStudent ? (
                    <Field>
                      <RequiredFieldLabel htmlFor="academic-person-pin">
                        {t("academicCreateDialog.pinLabel")}
                      </RequiredFieldLabel>
                      <Input
                        {...PROFILE_PIN_INPUT_PROPS}
                        id="academic-person-pin"
                        name="pin"
                        value={dialog.guardianPin}
                        onChange={(event) =>
                          dialog.setGuardianPin(event.target.value)
                        }
                        required
                      />
                      <FieldDescription>
                        {t("academicCreateDialog.pinHint")}
                      </FieldDescription>
                    </Field>
                  ) : null}
                </FieldGroup>
              </FieldSet>

              {isGuardianStudent ? (
                <TenantGuardianStudentProfilesFieldSet
                  studentProfiles={dialog.studentProfiles}
                  campuses={dialog.campusOptions}
                  isSubmitting={dialog.isSubmitting}
                  canAddStudentProfile={dialog.canAddStudentProfile}
                  onAddStudentProfile={dialog.addStudentProfile}
                  onRemoveStudentProfile={dialog.removeStudentProfile}
                  onUpdateStudentProfile={dialog.updateStudentProfile}
                  onStudentImageFileChange={dialog.setProfileImageFile}
                />
              ) : (
                <FieldSet>
                  <FieldLegend>
                    {role === "teacher"
                      ? t("academicCreateDialog.teacherLegend")
                      : t("academicCreateDialog.studentLegend")}
                  </FieldLegend>
                  <TenantAcademicProfileFormFields
                    fieldPrefix="academic-person"
                    isSaving={dialog.isSubmitting}
                    profile={dialog.primaryProfile}
                    campuses={dialog.campusOptions}
                    onChange={dialog.setPrimaryProfile}
                    onImageFileChange={dialog.setProfileImageFile}
                  />
                </FieldSet>
              )}

              {dialog.isLoadingCampuses ? (
                <p className="text-sm text-muted-foreground">
                  {t("academicCreateDialog.loadingCampuses")}
                </p>
              ) : null}

              <Button type="submit" disabled={dialog.isSubmitting}>
                {dialog.isSubmitting
                  ? t("academicCreateDialog.creating")
                  : t("academicCreateDialog.submit")}
              </Button>

              <FieldError>{dialog.error}</FieldError>
            </FieldGroup>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
