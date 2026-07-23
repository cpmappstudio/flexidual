"use client";

import {
  Add01Icon,
  Delete02Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import type { TenantAcademicProfileCampusOption } from "@/components/people/tenant-academic-profile-fields";
import { TenantAcademicProfileFormFields } from "@/components/people/tenant-academic-profile-form-fields";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import type { AcademicProfileDraft } from "@/lib/people/academic-person-draft";

export function TenantGuardianStudentProfilesFieldSet({
  studentProfiles,
  campuses,
  isSubmitting,
  canAddStudentProfile,
  onAddStudentProfile,
  onRemoveStudentProfile,
  onUpdateStudentProfile,
  onStudentImageFileChange,
}: {
  studentProfiles: AcademicProfileDraft[];
  campuses: TenantAcademicProfileCampusOption[];
  isSubmitting: boolean;
  canAddStudentProfile: boolean;
  onAddStudentProfile: () => void;
  onRemoveStudentProfile: (profileId: string) => void;
  onUpdateStudentProfile: (
    profileId: string,
    profile: AcademicProfileDraft,
  ) => void;
  onStudentImageFileChange: (profileId: string, file: File | null) => void;
}) {
  const t = useTranslations("TenantPeople");

  return (
    <FieldSet>
      <div className="flex items-center justify-between gap-3">
        <FieldLegend className="mb-0">
          {t("academicCreateDialog.studentsLegend")}
        </FieldLegend>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAddStudentProfile}
          onClick={onAddStudentProfile}
        >
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            aria-hidden="true"
          />
          {t("academicCreateDialog.addStudent")}
        </Button>
      </div>

      <ItemGroup>
        {studentProfiles.map((studentProfile, index) => (
          <Item
            key={studentProfile.id}
            variant="outline"
            className="items-start"
          >
            <ItemHeader>
              <ItemTitle>
                {t("academicCreateDialog.studentCardTitle", {
                  index: index + 1,
                })}
              </ItemTitle>
              {studentProfiles.length > 1 ? (
                <ItemActions>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={t(
                          "academicCreateDialog.studentActionsMenu",
                        )}
                      >
                        <HugeiconsIcon
                          icon={MoreHorizontalCircle01Icon}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        variant="destructive"
                        className="justify-between"
                        onClick={() =>
                          onRemoveStudentProfile(studentProfile.id)
                        }
                      >
                        <span>{t("academicCreateDialog.removeStudent")}</span>
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ItemActions>
              ) : null}
            </ItemHeader>
            <ItemContent className="basis-full gap-4">
              <TenantAcademicProfileFormFields
                fieldPrefix={`student-${studentProfile.id}`}
                isSaving={isSubmitting}
                profile={studentProfile}
                campuses={campuses}
                onChange={(nextProfile) =>
                  onUpdateStudentProfile(studentProfile.id, nextProfile)
                }
                onImageFileChange={onStudentImageFileChange}
              />
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </FieldSet>
  );
}
