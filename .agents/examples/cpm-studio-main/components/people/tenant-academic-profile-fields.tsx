import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { RequiredFieldLabel } from "@/components/forms/required-field-label";
import { TenantCampusSelect } from "@/components/people/tenant-campus-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AcademicProfileDraft } from "@/lib/people/academic-person-draft";

export type TenantAcademicProfileCampusOption = {
  _id: Id<"campuses">;
  name: string;
};

export function TenantAcademicProfileFields({
  fieldPrefix,
  profile,
  campuses,
  onChange,
}: {
  fieldPrefix: string;
  profile: AcademicProfileDraft;
  campuses: TenantAcademicProfileCampusOption[];
  onChange: (profile: AcademicProfileDraft) => void;
}) {
  const t = useTranslations("TenantPeople");

  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <Field>
        <RequiredFieldLabel htmlFor={`${fieldPrefix}-first-name`}>
          {t("createDialog.firstNameLabel")}
        </RequiredFieldLabel>
        <Input
          id={`${fieldPrefix}-first-name`}
          name={`${fieldPrefix}FirstName`}
          value={profile.firstName}
          onChange={(event) =>
            onChange({ ...profile, firstName: event.target.value })
          }
          autoComplete="off"
          required
        />
      </Field>

      <Field>
        <RequiredFieldLabel htmlFor={`${fieldPrefix}-last-name`}>
          {t("createDialog.lastNameLabel")}
        </RequiredFieldLabel>
        <Input
          id={`${fieldPrefix}-last-name`}
          name={`${fieldPrefix}LastName`}
          value={profile.lastName}
          onChange={(event) =>
            onChange({ ...profile, lastName: event.target.value })
          }
          autoComplete="off"
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${fieldPrefix}-campus`}>
          {t("academicCreateDialog.campusLabel")}
        </FieldLabel>
        <TenantCampusSelect
          triggerId={`${fieldPrefix}-campus`}
          value={profile.campusId || ""}
          campuses={campuses}
          emptyOptionLabel={t("academicCreateDialog.campusNoneOption")}
          onValueChange={(campusId) => {
            onChange({
              ...profile,
              campusId,
            });
          }}
        />
      </Field>
    </FieldGroup>
  );
}
