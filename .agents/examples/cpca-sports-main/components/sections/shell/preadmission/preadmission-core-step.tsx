"use client";

import { useTranslations } from "next-intl";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProgramIconAvatar } from "@/components/sections/shell/programs/program-icon-avatar";
import { PhotoUpload } from "./photo-upload";
import type {
  AvailableProgramForApplication,
  PreadmissionApplicantCore,
} from "./preadmission-types";

interface PreadmissionCoreStepProps {
  programs: AvailableProgramForApplication[];
  selectedProgramId: AvailableProgramForApplication["_id"] | null;
  applicant: PreadmissionApplicantCore;
  errors: Record<string, string>;
  onSelectProgram: (programId: AvailableProgramForApplication["_id"]) => void;
  onApplicantChange: (
    field: keyof PreadmissionApplicantCore,
    value: string | AvailableProgramForApplication["_id"] | null,
  ) => void;
}

export function PreadmissionCoreStep({
  programs,
  selectedProgramId,
  applicant,
  errors,
  onSelectProgram,
  onApplicantChange,
}: PreadmissionCoreStepProps) {
  const t = useTranslations("preadmission.core");

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("programTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("programDescription")}
          </p>
        </div>

        {programs.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t("emptyPrograms")}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {programs.map((program) => {
              const isSelected = selectedProgramId === program._id;

              return (
                <button
                  key={program._id}
                  type="button"
                  onClick={() => onSelectProgram(program._id)}
                  className={cn(
                    "rounded-xl border px-4 py-4 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/40 hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <ProgramIconAvatar
                      iconKey={program.iconKey}
                      className="size-12 shrink-0 rounded-lg"
                      iconClassName="size-7"
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{program.name}</p>
                      {program.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {program.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {errors.programId ? (
          <p className="text-sm text-destructive">{errors.programId}</p>
        ) : null}
      </div>

      <PhotoUpload
        value={applicant.photoStorageId}
        onChange={(storageId) => onApplicantChange("photoStorageId", storageId)}
        required
      />
      {errors.photoStorageId ? (
        <p className="text-sm text-destructive mt-1">{errors.photoStorageId}</p>
      ) : null}

      <FieldGroup>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Field>
            <FieldLabel>
              {t("firstName")}
              <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              value={applicant.firstName}
              onChange={(event) =>
                onApplicantChange("firstName", event.target.value)
              }
              placeholder={t("firstNamePlaceholder")}
            />
            {errors.firstName ? (
              <p className="text-sm text-destructive mt-1">{errors.firstName}</p>
            ) : null}
          </Field>

          <Field>
            <FieldLabel>
              {t("lastName")}
              <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              value={applicant.lastName}
              onChange={(event) =>
                onApplicantChange("lastName", event.target.value)
              }
              placeholder={t("lastNamePlaceholder")}
            />
            {errors.lastName ? (
              <p className="text-sm text-destructive mt-1">{errors.lastName}</p>
            ) : null}
          </Field>
        </div>
      </FieldGroup>

      <FieldGroup>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Field>
            <FieldLabel>
              {t("email")}
              <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              type="email"
              value={applicant.email}
              onChange={(event) => onApplicantChange("email", event.target.value)}
              placeholder={t("emailPlaceholder")}
            />
            {errors.email ? (
              <p className="text-sm text-destructive mt-1">{errors.email}</p>
            ) : null}
          </Field>

          <Field>
            <FieldLabel>
              {t("telephone")}
              <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              type="tel"
              value={applicant.telephone}
              onChange={(event) =>
                onApplicantChange("telephone", event.target.value)
              }
              placeholder={t("telephonePlaceholder")}
            />
            {errors.telephone ? (
              <p className="text-sm text-destructive mt-1">{errors.telephone}</p>
            ) : null}
          </Field>
        </div>
      </FieldGroup>
    </div>
  );
}
