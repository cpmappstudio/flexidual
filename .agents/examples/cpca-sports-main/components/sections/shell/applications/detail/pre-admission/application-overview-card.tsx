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

interface ApplicationOverviewCardProps {
  application: Application;
  isEditing: boolean;
  onDataChange?: (
    data: Record<string, string | number | boolean | null>,
  ) => void;
  onValidationChange?: (isValid: boolean) => void;
}

interface EditableFormData {
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  birthDate: string;
  sex: string;
  height: string;
  countryOfBirth: string;
  countryOfCitizenship: string;
  highlightsLink: string;
  program: string;
  format: string;
  gradeEntering: string;
  enrollmentYear: string;
  graduationYear: string;
  programOfInterest: string;
  needsI20: string;
  interestedInBoarding: string;
}

export function ApplicationOverviewCard({
  application,
  isEditing,
  onDataChange,
  onValidationChange,
}: ApplicationOverviewCardProps) {
  const t = useTranslations("Applications.detail");
  const tAthlete = useTranslations("preadmission.athlete");
  const tValidation = useTranslations("Common.validation");

  const { formData } = application;

  const [errors, setErrors] = useState<Record<string, string>>({});

  const firstName = getFormField(formData, "athlete", "firstName");
  const lastName = getFormField(formData, "athlete", "lastName");
  const email = getFormField(formData, "athlete", "email");
  const telephone = getFormField(formData, "athlete", "telephone");
  const birthDate = getFormField(formData, "athlete", "birthDate");
  const sex = getFormField(formData, "athlete", "sex");
  const height = getFormField(formData, "athlete", "height");
  const countryOfBirth = getFormField(formData, "athlete", "countryOfBirth");
  const countryOfCitizenship = getFormField(
    formData,
    "athlete",
    "countryOfCitizenship",
  );
  const highlightsLink = getFormField(formData, "athlete", "highlightsLink");
  const program = getFormField(formData, "athlete", "program");
  const format = getFormField(formData, "athlete", "format");
  const gradeEntering = getFormField(formData, "athlete", "gradeEntering");
  const enrollmentYear = getFormField(formData, "athlete", "enrollmentYear");
  const graduationYear = getFormField(formData, "athlete", "graduationYear");
  const programOfInterest = getFormField(
    formData,
    "athlete",
    "programOfInterest",
  );
  const needsI20 = getFormField(formData, "athlete", "needsI20");
  const interestedInBoarding = getFormField(
    formData,
    "general",
    "interestedInBoarding",
  );

  const [editData, setEditData] = useState<EditableFormData>({
    firstName,
    lastName,
    email,
    telephone,
    birthDate,
    sex,
    height,
    countryOfBirth,
    countryOfCitizenship,
    highlightsLink,
    program,
    format,
    gradeEntering,
    enrollmentYear,
    graduationYear,
    programOfInterest,
    needsI20,
    interestedInBoarding,
  });

  useEffect(() => {
    if (!isEditing) {
      setEditData({
        firstName,
        lastName,
        email,
        telephone,
        birthDate,
        sex,
        height,
        countryOfBirth,
        countryOfCitizenship,
        highlightsLink,
        program,
        format,
        gradeEntering,
        enrollmentYear,
        graduationYear,
        programOfInterest,
        needsI20,
        interestedInBoarding,
      });
    }
  }, [
    isEditing,
    firstName,
    lastName,
    email,
    telephone,
    birthDate,
    sex,
    height,
    countryOfBirth,
    countryOfCitizenship,
    highlightsLink,
    program,
    format,
    gradeEntering,
    enrollmentYear,
    graduationYear,
    programOfInterest,
    needsI20,
    interestedInBoarding,
  ]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const validateData = (data: EditableFormData): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    // Required fields from DEFAULT_FORM_SECTIONS
    if (!data.firstName.trim()) newErrors.firstName = tValidation("required");
    if (!data.lastName.trim()) newErrors.lastName = tValidation("required");
    if (!data.email.trim()) {
      newErrors.email = tValidation("required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      newErrors.email = tValidation("email");
    }
    if (!data.telephone.trim()) newErrors.telephone = tValidation("required");
    if (!data.birthDate) newErrors.birthDate = tValidation("required");
    if (!data.sex) newErrors.sex = tValidation("required");
    if (!data.countryOfBirth)
      newErrors.countryOfBirth = tValidation("required");
    if (!data.countryOfCitizenship)
      newErrors.countryOfCitizenship = tValidation("required");
    if (!data.format) newErrors.format = tValidation("required");
    if (!data.program) newErrors.program = tValidation("required");
    if (!data.enrollmentYear)
      newErrors.enrollmentYear = tValidation("required");
    if (!data.graduationYear)
      newErrors.graduationYear = tValidation("required");
    if (!data.gradeEntering) newErrors.gradeEntering = tValidation("required");
    if (!data.needsI20) newErrors.needsI20 = tValidation("required");

    return newErrors;
  };

  const handleFieldChange = (field: keyof EditableFormData, value: string) => {
    const newData = { ...editData, [field]: value };
    setEditData(newData);

    // Validate and update errors
    const newErrors = validateData(newData);
    setErrors(newErrors);
    onValidationChange?.(Object.keys(newErrors).length === 0);

    // Report to parent only athlete section fields (exclude interestedInBoarding which belongs to general)
    const athleteData = Object.fromEntries(
      Object.entries(newData).filter(([key]) => key !== "interestedInBoarding"),
    ) as Omit<EditableFormData, "interestedInBoarding">;
    onDataChange?.(athleteData);
  };

  return (
    <Card>
      <CardContent className="space-y-6">
        <div>
          <div className="mb-3">
            <h3 className="text-base font-bold text-foreground">
              {t("athleteInfo")}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("fullName")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        value={editData.firstName}
                        onChange={(e) =>
                          handleFieldChange("firstName", e.target.value)
                        }
                        placeholder={t("firstName")}
                        className={`h-8 text-sm ${errors.firstName ? "border-destructive" : ""}`}
                      />
                      {errors.firstName && (
                        <p className="text-xs text-destructive mt-1">
                          {errors.firstName}
                        </p>
                      )}
                    </div>
                    <div className="flex-1">
                      <Input
                        value={editData.lastName}
                        onChange={(e) =>
                          handleFieldChange("lastName", e.target.value)
                        }
                        placeholder={t("lastName")}
                        className={`h-8 text-sm ${errors.lastName ? "border-destructive" : ""}`}
                      />
                      {errors.lastName && (
                        <p className="text-xs text-destructive mt-1">
                          {errors.lastName}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm break-words">
                  {`${firstName} ${lastName}`.trim() || "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("sex")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Select
                    value={editData.sex}
                    onValueChange={(value) => handleFieldChange("sex", value)}
                  >
                    <SelectTrigger
                      className={`h-8 w-full text-sm ${errors.sex ? "border-destructive" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">
                        {tAthlete("sexMale")}
                      </SelectItem>
                      <SelectItem value="female">
                        {tAthlete("sexFemale")}
                      </SelectItem>
                      <SelectItem value="other">
                        {tAthlete("sexOther")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.sex && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.sex}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">
                  {sex === "male"
                    ? tAthlete("sexMale")
                    : sex === "female"
                      ? tAthlete("sexFemale")
                      : sex === "other"
                        ? tAthlete("sexOther")
                        : "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("birthDate")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Input
                    type="date"
                    value={editData.birthDate}
                    onChange={(e) =>
                      handleFieldChange("birthDate", e.target.value)
                    }
                    className={`h-8 text-sm ${errors.birthDate ? "border-destructive" : ""}`}
                  />
                  {errors.birthDate && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.birthDate}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">{formatDate(birthDate)}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("height")}
              </p>
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={editData.height.split("-")[0] || ""}
                    onChange={(e) => {
                      const inches = editData.height.split("-")[1] || "";
                      handleFieldChange(
                        "height",
                        `${e.target.value}-${inches}`,
                      );
                    }}
                    placeholder={tAthlete("heightFeet")}
                    type="number"
                    className="h-8 text-sm w-1/2"
                  />
                  <Input
                    value={editData.height.split("-")[1] || ""}
                    onChange={(e) => {
                      const feet = editData.height.split("-")[0] || "";
                      handleFieldChange("height", `${feet}-${e.target.value}`);
                    }}
                    placeholder={tAthlete("heightInches")}
                    type="number"
                    className="h-8 text-sm w-1/2"
                  />
                </div>
              ) : (
                <p className="text-sm break-words">
                  {height
                    ? `${height.split("-")[0] || "-"}' ${height.split("-")[1] || "-"}"`
                    : "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("birthCountry")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <CountryCombobox
                    value={editData.countryOfBirth}
                    onValueChange={(value) =>
                      handleFieldChange("countryOfBirth", value)
                    }
                    placeholder={tAthlete("countryOfBirthPlaceholder")}
                  />
                  {errors.countryOfBirth && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.countryOfBirth}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">
                  {getCountryName(countryOfBirth) || "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {tAthlete("countryOfCitizenship")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <CountryCombobox
                    value={editData.countryOfCitizenship}
                    onValueChange={(value) =>
                      handleFieldChange("countryOfCitizenship", value)
                    }
                    placeholder={tAthlete("countryOfCitizenshipPlaceholder")}
                  />
                  {errors.countryOfCitizenship && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.countryOfCitizenship}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">
                  {getCountryName(countryOfCitizenship) || "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("email")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Input
                    type="email"
                    value={editData.email}
                    onChange={(e) => handleFieldChange("email", e.target.value)}
                    className={`h-8 text-sm ${errors.email ? "border-destructive" : ""}`}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.email}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">{email || "-"}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("phone")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Input
                    type="tel"
                    value={editData.telephone}
                    onChange={(e) =>
                      handleFieldChange("telephone", e.target.value)
                    }
                    className={`h-8 text-sm ${errors.telephone ? "border-destructive" : ""}`}
                  />
                  {errors.telephone && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.telephone}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">{telephone || "-"}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("highlights")}
              </p>
              {isEditing ? (
                <Input
                  type="url"
                  value={editData.highlightsLink}
                  onChange={(e) =>
                    handleFieldChange("highlightsLink", e.target.value)
                  }
                  className="h-8 text-sm"
                />
              ) : highlightsLink ? (
                <a
                  href={highlightsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline break-all"
                >
                  {highlightsLink}
                </a>
              ) : (
                <p className="text-sm break-words">-</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-base font-bold text-foreground mb-3">
            {t("programInfo")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("format")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Select
                    value={editData.format}
                    onValueChange={(value) =>
                      handleFieldChange("format", value)
                    }
                  >
                    <SelectTrigger
                      className={`h-8 text-sm w-full ${errors.format ? "border-destructive" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="american">
                        {tAthlete("formatAmerican")}
                      </SelectItem>
                      <SelectItem value="international">
                        {tAthlete("formatInternational")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.format && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.format}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm capitalize">
                  {format === "american"
                    ? tAthlete("formatAmerican")
                    : format === "international"
                      ? tAthlete("formatInternational")
                      : "-"}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("program")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Select
                    value={editData.program}
                    onValueChange={(value) =>
                      handleFieldChange("program", value)
                    }
                  >
                    <SelectTrigger
                      className={`h-8 text-sm w-full ${errors.program ? "border-destructive" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baseball">
                        {tAthlete("programBaseball")}
                      </SelectItem>
                      <SelectItem value="basketball">
                        {tAthlete("programBasketball")}
                      </SelectItem>
                      <SelectItem value="soccer">
                        {tAthlete("programSoccer")}
                      </SelectItem>
                      <SelectItem value="volleyball">
                        {tAthlete("programVolleyball")}
                      </SelectItem>
                      <SelectItem value="hr14_baseball">
                        {tAthlete("programHR14Baseball")}
                      </SelectItem>
                      <SelectItem value="golf">
                        {tAthlete("programGolf")}
                      </SelectItem>
                      <SelectItem value="tennis">
                        {tAthlete("programTennis")}
                      </SelectItem>
                      <SelectItem value="softball">
                        {tAthlete("programSoftball")}
                      </SelectItem>
                      <SelectItem value="volleyball-club">
                        {tAthlete("programVolleyballClub")}
                      </SelectItem>
                      <SelectItem value="pg-basketball">
                        {tAthlete("programPGBasketball")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.program && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.program}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm capitalize">
                  {program
                    ? tAthlete(
                        `program${program.charAt(0).toUpperCase() + program.slice(1).replace(/-/g, "")}` as keyof typeof tAthlete,
                      )
                    : "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("enrollmentYear")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Select
                    value={editData.enrollmentYear}
                    onValueChange={(value) =>
                      handleFieldChange("enrollmentYear", value)
                    }
                  >
                    <SelectTrigger
                      className={`h-8 text-sm ${errors.enrollmentYear ? "border-destructive" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => {
                        const year = new Date().getFullYear() + i;
                        return (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {errors.enrollmentYear && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.enrollmentYear}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">{enrollmentYear || "-"}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("graduationYear")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Select
                    value={editData.graduationYear}
                    onValueChange={(value) =>
                      handleFieldChange("graduationYear", value)
                    }
                  >
                    <SelectTrigger
                      className={`h-8 text-sm ${errors.graduationYear ? "border-destructive" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => {
                        const year = new Date().getFullYear() + i;
                        return (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {errors.graduationYear && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.graduationYear}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">{graduationYear || "-"}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("programOfInterest")}
              </p>
              {isEditing ? (
                <Select
                  value={editData.programOfInterest}
                  onValueChange={(value) =>
                    handleFieldChange("programOfInterest", value)
                  }
                >
                  <SelectTrigger className="h-8 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elementary">
                      {tAthlete("programElementary")}
                    </SelectItem>
                    <SelectItem value="middle">
                      {tAthlete("programMiddle")}
                    </SelectItem>
                    <SelectItem value="high">
                      {tAthlete("programHigh")}
                    </SelectItem>
                    <SelectItem value="postgraduate">
                      {tAthlete("programPostgraduate")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm capitalize">
                  {programOfInterest
                    ? tAthlete(
                        `program${programOfInterest.charAt(0).toUpperCase() + programOfInterest.slice(1)}` as keyof typeof tAthlete,
                      )
                    : "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("gradeEntering")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Select
                    value={editData.gradeEntering}
                    onValueChange={(value) =>
                      handleFieldChange("gradeEntering", value)
                    }
                  >
                    <SelectTrigger
                      className={`h-8 text-sm w-full ${errors.gradeEntering ? "border-destructive" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{tAthlete("grade1")}</SelectItem>
                      <SelectItem value="2">{tAthlete("grade2")}</SelectItem>
                      <SelectItem value="3">{tAthlete("grade3")}</SelectItem>
                      <SelectItem value="4">{tAthlete("grade4")}</SelectItem>
                      <SelectItem value="5">{tAthlete("grade5")}</SelectItem>
                      <SelectItem value="6">{tAthlete("grade6")}</SelectItem>
                      <SelectItem value="7">{tAthlete("grade7")}</SelectItem>
                      <SelectItem value="8">{tAthlete("grade8")}</SelectItem>
                      <SelectItem value="9">{tAthlete("grade9")}</SelectItem>
                      <SelectItem value="10">{tAthlete("grade10")}</SelectItem>
                      <SelectItem value="11">{tAthlete("grade11")}</SelectItem>
                      <SelectItem value="12">{tAthlete("grade12")}</SelectItem>
                      <SelectItem value="postgraduate">
                        {tAthlete("gradePostgraduate")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.gradeEntering && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.gradeEntering}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm capitalize">
                  {gradeEntering
                    ? gradeEntering === "postgraduate"
                      ? tAthlete("gradePostgraduate")
                      : tAthlete(
                          `grade${gradeEntering}` as keyof typeof tAthlete,
                        )
                    : "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {tAthlete("needsI20")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Select
                    value={editData.needsI20}
                    onValueChange={(value) =>
                      handleFieldChange("needsI20", value)
                    }
                  >
                    <SelectTrigger
                      className={`h-8 text-sm w-full ${errors.needsI20 ? "border-destructive" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-citizen">
                        {tAthlete("i20NoCitizen")}
                      </SelectItem>
                      <SelectItem value="no-non-citizen">
                        {tAthlete("i20NoNonCitizen")}
                      </SelectItem>
                      <SelectItem value="yes-new">
                        {tAthlete("i20YesNew")}
                      </SelectItem>
                      <SelectItem value="yes-transfer">
                        {tAthlete("i20YesTransfer")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.needsI20 && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.needsI20}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm capitalize">
                  {needsI20
                    ? needsI20 === "no-citizen"
                      ? tAthlete("i20NoCitizen")
                      : needsI20 === "no-non-citizen"
                        ? tAthlete("i20NoNonCitizen")
                        : needsI20 === "yes-new"
                          ? tAthlete("i20YesNew")
                          : needsI20 === "yes-transfer"
                            ? tAthlete("i20YesTransfer")
                            : "-"
                    : "-"}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
