"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CountryCombobox } from "@/components/ui/country-combobox";
import type { Application } from "@/lib/applications/types";
import { getFormField } from "@/lib/applications/types";
import { getCountryName } from "@/lib/countries/countries";

interface ApplicationAddressCardProps {
  application: Application;
  isEditing: boolean;
  onDataChange?: (data: Record<string, string | number | boolean | null>) => void;
  onValidationChange?: (isValid: boolean) => void;
}

interface EditableFormData {
  country: string;
  state: string;
  city: string;
  streetAddress: string;
  zipCode: string;
}

export function ApplicationAddressCard({
  application,
  isEditing,
  onDataChange,
  onValidationChange,
}: ApplicationAddressCardProps) {
  const t = useTranslations("Applications.detail");
  const tAddress = useTranslations("preadmission.address");
  const tValidation = useTranslations("Common.validation");

  const { formData } = application;

  const [errors, setErrors] = useState<Record<string, string>>({});

  const country = getFormField(formData, "address", "country");
  const state = getFormField(formData, "address", "state");
  const city = getFormField(formData, "address", "city");
  const streetAddress = getFormField(formData, "address", "streetAddress");
  const zipCode = getFormField(formData, "address", "zipCode");

  const [editData, setEditData] = useState<EditableFormData>({
    country,
    state,
    city,
    streetAddress,
    zipCode,
  });

  useEffect(() => {
    if (!isEditing) {
      setEditData({
        country,
        state,
        city,
        streetAddress,
        zipCode,
      });
    }
  }, [isEditing, country, state, city, streetAddress, zipCode]);

  const validateData = (data: EditableFormData): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    
    // All address fields are required according to DEFAULT_FORM_SECTIONS
    if (!data.country) newErrors.country = tValidation("required");
    if (!data.state.trim()) newErrors.state = tValidation("required");
    if (!data.city.trim()) newErrors.city = tValidation("required");
    if (!data.streetAddress.trim()) newErrors.streetAddress = tValidation("required");
    if (!data.zipCode.trim()) newErrors.zipCode = tValidation("required");
    
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

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="mb-3">
          <h3 className="text-base font-bold text-foreground">
            {t("addressInfo")}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t("country")}
              <span className="text-destructive ml-1">*</span>
            </p>
            {isEditing ? (
              <>
                <CountryCombobox
                  value={editData.country}
                  onValueChange={(value) => handleFieldChange("country", value)}
                  placeholder={tAddress("countryPlaceholder")}
                />
                {errors.country && (
                  <p className="text-xs text-destructive mt-1">{errors.country}</p>
                )}
              </>
            ) : (
              <p className="text-sm">{getCountryName(country) || "-"}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t("state")}
              <span className="text-destructive ml-1">*</span>
            </p>
            {isEditing ? (
              <>
                <Input
                  value={editData.state}
                  onChange={(e) => handleFieldChange("state", e.target.value)}
                  placeholder={tAddress("statePlaceholder")}
                  className={`h-8 text-sm ${errors.state ? "border-destructive" : ""}`}
                />
                {errors.state && (
                  <p className="text-xs text-destructive mt-1">{errors.state}</p>
                )}
              </>
            ) : (
              <p className="text-sm">{state || "-"}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t("city")}
              <span className="text-destructive ml-1">*</span>
            </p>
            {isEditing ? (
              <>
                <Input
                  value={editData.city}
                  onChange={(e) => handleFieldChange("city", e.target.value)}
                  placeholder={tAddress("cityPlaceholder")}
                  className={`h-8 text-sm ${errors.city ? "border-destructive" : ""}`}
                />
                {errors.city && (
                  <p className="text-xs text-destructive mt-1">{errors.city}</p>
                )}
              </>
            ) : (
              <p className="text-sm">{city || "-"}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t("streetAddress")}
              <span className="text-destructive ml-1">*</span>
            </p>
            {isEditing ? (
              <>
                <Input
                  value={editData.streetAddress}
                  onChange={(e) =>
                    handleFieldChange("streetAddress", e.target.value)
                  }
                  placeholder={tAddress("streetAddressPlaceholder")}
                  className={`h-8 text-sm ${errors.streetAddress ? "border-destructive" : ""}`}
                />
                {errors.streetAddress && (
                  <p className="text-xs text-destructive mt-1">{errors.streetAddress}</p>
                )}
              </>
            ) : (
              <p className="text-sm">{streetAddress || "-"}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t("zipCode")}
              <span className="text-destructive ml-1">*</span>
            </p>
            {isEditing ? (
              <>
                <Input
                  value={editData.zipCode}
                  onChange={(e) => handleFieldChange("zipCode", e.target.value)}
                  placeholder={tAddress("zipCodePlaceholder")}
                  className={`h-8 text-sm ${errors.zipCode ? "border-destructive" : ""}`}
                />
                {errors.zipCode && (
                  <p className="text-xs text-destructive mt-1">{errors.zipCode}</p>
                )}
              </>
            ) : (
              <p className="text-sm">{zipCode || "-"}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
