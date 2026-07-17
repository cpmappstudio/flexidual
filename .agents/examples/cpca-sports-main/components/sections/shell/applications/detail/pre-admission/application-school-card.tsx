"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CountryCombobox } from "@/components/ui/country-combobox";
import type { Application } from "@/lib/applications/types";
import { getFormField } from "@/lib/applications/types";
import { getCountryName } from "@/lib/countries/countries";

interface ApplicationSchoolCardProps {
  application: Application;
  isEditing: boolean;
  onDataChange?: (
    data: Record<string, string | number | boolean | null>,
  ) => void;
  onValidationChange?: (isValid: boolean) => void;
}

interface EditableFormData {
  currentSchoolName: string;
  currentSchoolType: string;
  currentGPA: string;
  schoolAddress: string;
  schoolCity: string;
  schoolCountry: string;
  schoolState: string;
  schoolZipCode: string;
  referenceFullName: string;
  referencePhone: string;
  referenceRelationship: string;
}

export function ApplicationSchoolCard({
  application,
  isEditing,
  onDataChange,
  onValidationChange,
}: ApplicationSchoolCardProps) {
  const t = useTranslations("Applications.detail");
  const tSchool = useTranslations("preadmission.school");
  const tValidation = useTranslations("Common.validation");

  const { formData } = application;

  const [errors, setErrors] = useState<Record<string, string>>({});

  const currentSchoolName = getFormField(
    formData,
    "school",
    "currentSchoolName",
  );
  const schoolAddress = getFormField(formData, "school", "schoolAddress");
  const schoolCity = getFormField(formData, "school", "schoolCity");
  const schoolState = getFormField(formData, "school", "schoolState");
  const schoolZipCode = getFormField(formData, "school", "schoolZipCode");
  const schoolCountry = getFormField(formData, "school", "schoolCountry");
  const currentSchoolType = getFormField(
    formData,
    "school",
    "currentSchoolType",
  );
  const currentGPA = getFormField(formData, "school", "currentGPA");
  const referenceFullName = getFormField(
    formData,
    "school",
    "referenceFullName",
  );
  const referenceRelationship = getFormField(
    formData,
    "school",
    "referenceRelationship",
  );
  const referencePhone = getFormField(formData, "school", "referencePhone");

  const [editData, setEditData] = useState<EditableFormData>({
    currentSchoolName,
    currentSchoolType,
    currentGPA,
    schoolAddress,
    schoolCity,
    schoolCountry,
    schoolState,
    schoolZipCode,
    referenceFullName,
    referencePhone,
    referenceRelationship,
  });

  useEffect(() => {
    if (!isEditing) {
      setEditData({
        currentSchoolName,
        currentSchoolType,
        currentGPA,
        schoolAddress,
        schoolCity,
        schoolCountry,
        schoolState,
        schoolZipCode,
        referenceFullName,
        referencePhone,
        referenceRelationship,
      });
      setErrors({});
    }
  }, [
    isEditing,
    currentSchoolName,
    currentSchoolType,
    currentGPA,
    schoolAddress,
    schoolCity,
    schoolCountry,
    schoolState,
    schoolZipCode,
    referenceFullName,
    referencePhone,
    referenceRelationship,
  ]);

  const validateData = (data: EditableFormData): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    // All required fields from DEFAULT_FORM_SECTIONS: school section
    if (!data.currentSchoolName.trim()) {
      newErrors.currentSchoolName = tValidation("required");
    }
    if (!data.currentSchoolType.trim()) {
      newErrors.currentSchoolType = tValidation("required");
    }
    if (!data.schoolCountry.trim()) {
      newErrors.schoolCountry = tValidation("required");
    }
    if (!data.schoolState.trim()) {
      newErrors.schoolState = tValidation("required");
    }
    if (!data.schoolCity.trim()) {
      newErrors.schoolCity = tValidation("required");
    }
    if (!data.currentGPA.trim()) {
      newErrors.currentGPA = tValidation("required");
    }
    if (!data.referenceFullName.trim()) {
      newErrors.referenceFullName = tValidation("required");
    }
    if (!data.referencePhone.trim()) {
      newErrors.referencePhone = tValidation("required");
    }
    if (!data.referenceRelationship.trim()) {
      newErrors.referenceRelationship = tValidation("required");
    }

    return newErrors;
  };

  const handleFieldChange = (field: keyof EditableFormData, value: string) => {
    const newData = { ...editData, [field]: value };
    setEditData(newData);
    const newErrors = validateData(newData);
    setErrors(newErrors);
    onValidationChange?.(Object.keys(newErrors).length === 0);
    onDataChange?.(newData);
  };

  const getSchoolTypeLabel = (type: string) => {
    switch (type) {
      case "elementary":
        return tSchool("programElementary");
      case "middle":
        return tSchool("programMiddle");
      case "high":
        return tSchool("programHigh");
      case "postgraduate":
        return tSchool("programPostgraduate");  
      default:
        return type || "-";
    }
  };

  const fullSchoolAddress = [
    schoolAddress,
    schoolCity,
    schoolState,
    schoolZipCode,
    getCountryName(schoolCountry),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="mb-3">
          <h3 className="text-base font-bold text-foreground">
            {t("schoolInfo")}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t("currentSchool")}
              <span className="text-destructive ml-1">*</span>
            </p>
            {isEditing ? (
              <>
                <Input
                  value={editData.currentSchoolName}
                  onChange={(e) =>
                    handleFieldChange("currentSchoolName", e.target.value)
                  }
                  placeholder={tSchool("currentSchoolNamePlaceholder")}
                  className={`h-8 text-sm ${errors.currentSchoolName ? "border-destructive" : ""}`}
                />
                {errors.currentSchoolName && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.currentSchoolName}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm wrap-break-word">
                {currentSchoolName || "-"}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t("schoolType")}
              <span className="text-destructive ml-1">*</span>
            </p>
            {isEditing ? (
              <>
                <Select
                  value={editData.currentSchoolType}
                  onValueChange={(value) =>
                    handleFieldChange("currentSchoolType", value)
                  }
                >
                  <SelectTrigger
                    className={`w-full h-8 text-sm ${errors.currentSchoolType ? "border-destructive" : ""}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elementary">
                      {tSchool("programElementary")}
                    </SelectItem>
                    <SelectItem value="middle">{tSchool("programMiddle")}</SelectItem>
                    <SelectItem value="high">{tSchool("programHigh")}</SelectItem>
                    <SelectItem value="postgraduate">
                      {tSchool("programPostgraduate")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {errors.currentSchoolType && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.currentSchoolType}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm wrap-break-word">
                {getSchoolTypeLabel(currentSchoolType)}
              </p>
            )}
          </div>

          {isEditing ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {tSchool("country")}
                  <span className="text-destructive ml-1">*</span>
                </p>
                <CountryCombobox
                  value={editData.schoolCountry}
                  onValueChange={(value) =>
                    handleFieldChange("schoolCountry", value)
                  }
                  placeholder={tSchool("countryPlaceholder")}
                />
                {errors.schoolCountry && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.schoolCountry}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {tSchool("state")}
                  <span className="text-destructive ml-1">*</span>
                </p>
                <Input
                  value={editData.schoolState}
                  onChange={(e) =>
                    handleFieldChange("schoolState", e.target.value)
                  }
                  placeholder={tSchool("statePlaceholder")}
                  className={`h-8 text-sm ${errors.schoolState ? "border-destructive" : ""}`}
                />
                {errors.schoolState && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.schoolState}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {tSchool("city")}
                  <span className="text-destructive ml-1">*</span>
                </p>
                <Input
                  value={editData.schoolCity}
                  onChange={(e) =>
                    handleFieldChange("schoolCity", e.target.value)
                  }
                  placeholder={tSchool("cityPlaceholder")}
                  className={`h-8 text-sm ${errors.schoolCity ? "border-destructive" : ""}`}
                />
                {errors.schoolCity && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.schoolCity}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("schoolAddress")}
                <span className="text-destructive ml-1">*</span>
              </p>
              <p className="text-sm wrap-break-word">
                {fullSchoolAddress || "-"}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t("gpa")}
              <span className="text-destructive ml-1">*</span>
            </p>
            {isEditing ? (
              <>
                <Input
                  value={editData.currentGPA}
                  onChange={(e) =>
                    handleFieldChange("currentGPA", e.target.value)
                  }
                  placeholder={tSchool("currentGPAPlaceholder")}
                  className={`h-8 text-sm ${errors.currentGPA ? "border-destructive" : ""}`}
                />
                {errors.currentGPA && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.currentGPA}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm wrap-break-word">{currentGPA || "-"}</p>
            )}
          </div>
        </div>

        

        <div>
          <h4 className="text-base font-bold text-foreground mb-3">
            {t("reference")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("referenceName")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Input
                    value={editData.referenceFullName}
                    onChange={(e) =>
                      handleFieldChange("referenceFullName", e.target.value)
                    }
                    placeholder={tSchool("referenceFullNamePlaceholder")}
                    className={`h-8 text-sm ${errors.referenceFullName ? "border-destructive" : ""}`}
                  />
                  {errors.referenceFullName && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.referenceFullName}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">{referenceFullName || "-"}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("referencePhone")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Input
                    type="tel"
                    value={editData.referencePhone}
                    onChange={(e) =>
                      handleFieldChange("referencePhone", e.target.value)
                    }
                    placeholder={tSchool("referencePhonePlaceholder")}
                    className={`h-8 text-sm ${errors.referencePhone ? "border-destructive" : ""}`}
                  />
                  {errors.referencePhone && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.referencePhone}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">{referencePhone || "-"}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("referenceRelationship")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Input
                    value={editData.referenceRelationship}
                    onChange={(e) =>
                      handleFieldChange("referenceRelationship", e.target.value)
                    }
                    placeholder={tSchool("referenceRelationshipPlaceholder")}
                    className={`h-8 text-sm ${errors.referenceRelationship ? "border-destructive" : ""}`}
                  />
                  {errors.referenceRelationship && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.referenceRelationship}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">{referenceRelationship || "-"}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
