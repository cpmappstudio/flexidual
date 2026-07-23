import {
  TenantAcademicProfileFields,
  type TenantAcademicProfileCampusOption,
} from "@/components/people/tenant-academic-profile-fields";
import { TenantAcademicProfileImageField } from "@/components/people/tenant-academic-profile-image-field";
import type { AcademicProfileDraft } from "@/lib/people/academic-person-draft";

export function TenantAcademicProfileFormFields({
  campuses,
  fieldPrefix,
  isSaving,
  profile,
  onChange,
  onImageFileChange,
}: {
  campuses: TenantAcademicProfileCampusOption[];
  fieldPrefix: string;
  isSaving: boolean;
  profile: AcademicProfileDraft;
  onChange: (profile: AcademicProfileDraft) => void;
  onImageFileChange: (profileId: string, file: File | null) => void;
}) {
  return (
    <>
      <TenantAcademicProfileImageField
        profileId={profile.id}
        firstName={profile.firstName}
        lastName={profile.lastName}
        isSaving={isSaving}
        onImageFileChange={onImageFileChange}
      />
      <TenantAcademicProfileFields
        fieldPrefix={fieldPrefix}
        profile={profile}
        campuses={campuses}
        onChange={onChange}
      />
    </>
  );
}
