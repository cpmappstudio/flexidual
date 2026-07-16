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
import type { Application } from "@/lib/applications/types";
import { getFormField } from "@/lib/applications/types";

interface ApplicationParentsCardProps {
  application: Application;
  isEditing: boolean;
  onDataChange?: (data: Record<string, string | number | boolean | null>) => void;
  onValidationChange?: (isValid: boolean) => void;
}

interface EditableFormData {
  parent1FirstName: string;
  parent1LastName: string;
  parent1Relationship: string;
  parent1Email: string;
  parent1Telephone: string;
  parent2FirstName: string;
  parent2LastName: string;
  parent2Relationship: string;
  parent2Email: string;
  parent2Telephone: string;
}

export function ApplicationParentsCard({
  application,
  isEditing,
  onDataChange,
  onValidationChange,
}: ApplicationParentsCardProps) {
  const t = useTranslations("Applications.detail");
  const tParents = useTranslations("preadmission.parents");
  const tValidation = useTranslations("Common.validation");

  const { formData } = application;

  const [errors, setErrors] = useState<Record<string, string>>({});

  const parent1FirstName = getFormField(
    formData,
    "parents",
    "parent1FirstName",
  );
  const parent1LastName = getFormField(formData, "parents", "parent1LastName");
  const parent1Relationship = getFormField(
    formData,
    "parents",
    "parent1Relationship",
  );
  const parent1Email = getFormField(formData, "parents", "parent1Email");
  const parent1Telephone = getFormField(
    formData,
    "parents",
    "parent1Telephone",
  );
  const parent2FirstName = getFormField(
    formData,
    "parents",
    "parent2FirstName",
  );
  const parent2LastName = getFormField(formData, "parents", "parent2LastName");
  const parent2Relationship = getFormField(
    formData,
    "parents",
    "parent2Relationship",
  );
  const parent2Email = getFormField(formData, "parents", "parent2Email");
  const parent2Telephone = getFormField(
    formData,
    "parents",
    "parent2Telephone",
  );

  const [editData, setEditData] = useState<EditableFormData>({
    parent1FirstName,
    parent1LastName,
    parent1Relationship,
    parent1Email,
    parent1Telephone,
    parent2FirstName,
    parent2LastName,
    parent2Relationship,
    parent2Email,
    parent2Telephone,
  });

  useEffect(() => {
    if (!isEditing) {
      setEditData({
        parent1FirstName,
        parent1LastName,
        parent1Relationship,
        parent1Email,
        parent1Telephone,
        parent2FirstName,
        parent2LastName,
        parent2Relationship,
        parent2Email,
        parent2Telephone,
      });
      setErrors({});
    }
  }, [isEditing, parent1FirstName, parent1LastName, parent1Relationship, parent1Email, parent1Telephone, parent2FirstName, parent2LastName, parent2Relationship, parent2Email, parent2Telephone]);

  const validateData = (data: EditableFormData): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    if (!data.parent1FirstName.trim()) {
      newErrors.parent1FirstName = tValidation("required");
    }
    if (!data.parent1LastName.trim()) {
      newErrors.parent1LastName = tValidation("required");
    }
    if (!data.parent1Relationship.trim()) {
      newErrors.parent1Relationship = tValidation("required");
    }
    if (!data.parent1Email.trim()) {
      newErrors.parent1Email = tValidation("required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.parent1Email)) {
      newErrors.parent1Email = tValidation("email");
    }
    if (!data.parent1Telephone.trim()) {
      newErrors.parent1Telephone = tValidation("required");
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

  const getRelationshipLabel = (relationship: string) => {
    switch (relationship) {
      case "father":
        return tParents("relationshipFather");
      case "mother":
        return tParents("relationshipMother");
      default:
        return relationship || "-";
    }
  };

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="mb-3">
          <h3 className="text-base font-bold text-foreground">
            {t("parentsInfo")}
          </h3>
        </div>

        <div>
          <h4 className="text-base font-bold text-foreground mb-3">
            {t("parent1")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("fullName")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      value={editData.parent1FirstName}
                      onChange={(e) =>
                        handleFieldChange("parent1FirstName", e.target.value)
                      }
                      placeholder={tParents("firstNamePlaceholder")}
                      className={`h-8 text-sm ${errors.parent1FirstName ? "border-destructive" : ""}`}
                    />
                    <Input
                      value={editData.parent1LastName}
                      onChange={(e) =>
                        handleFieldChange("parent1LastName", e.target.value)
                      }
                      placeholder={tParents("lastNamePlaceholder")}
                      className={`h-8 text-sm ${errors.parent1LastName ? "border-destructive" : ""}`}
                    />
                  </div>
                  {(errors.parent1FirstName || errors.parent1LastName) && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.parent1FirstName || errors.parent1LastName}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">
                  {`${parent1FirstName} ${parent1LastName}`.trim() || "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("relationship")}
                <span className="text-destructive ml-1">*</span>
              </p>
              {isEditing ? (
                <>
                  <Select
                    value={editData.parent1Relationship}
                    onValueChange={(value) =>
                      handleFieldChange("parent1Relationship", value)
                    }
                  >
                    <SelectTrigger
                      className={`w-full h-8 text-sm ${errors.parent1Relationship ? "border-destructive" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="father">
                        {tParents("relationshipFather")}
                      </SelectItem>
                      <SelectItem value="mother">
                        {tParents("relationshipMother")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.parent1Relationship && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.parent1Relationship}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">
                  {getRelationshipLabel(parent1Relationship)}
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
                    value={editData.parent1Email}
                    onChange={(e) =>
                      handleFieldChange("parent1Email", e.target.value)
                    }
                    placeholder={tParents("emailPlaceholder")}
                    className={`h-8 text-sm ${errors.parent1Email ? "border-destructive" : ""}`}
                  />
                  {errors.parent1Email && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.parent1Email}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">{parent1Email || "-"}</p>
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
                    value={editData.parent1Telephone}
                    onChange={(e) =>
                      handleFieldChange("parent1Telephone", e.target.value)
                    }
                    placeholder={tParents("telephonePlaceholder")}
                    className={`h-8 text-sm ${errors.parent1Telephone ? "border-destructive" : ""}`}
                  />
                  {errors.parent1Telephone && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.parent1Telephone}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm break-words">{parent1Telephone || "-"}</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-base font-bold text-foreground mb-3">
            {t("parent2")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("fullName")}
              </p>
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={editData.parent2FirstName}
                    onChange={(e) =>
                      handleFieldChange("parent2FirstName", e.target.value)
                    }
                    placeholder={tParents("firstNamePlaceholder")}
                    className="h-8 text-sm"
                  />
                  <Input
                    value={editData.parent2LastName}
                    onChange={(e) =>
                      handleFieldChange("parent2LastName", e.target.value)
                    }
                    placeholder={tParents("lastNamePlaceholder")}
                    className="h-8 text-sm"
                  />
                </div>
              ) : (
                <p className="text-sm break-words">
                  {parent2FirstName
                    ? `${parent2FirstName} ${parent2LastName}`.trim()
                    : "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("relationship")}
              </p>
              {isEditing ? (
                <Select
                  value={editData.parent2Relationship}
                  onValueChange={(value) =>
                    handleFieldChange("parent2Relationship", value)
                  }
                >
                  <SelectTrigger className="w-full h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="father">
                      {tParents("relationshipFather")}
                    </SelectItem>
                    <SelectItem value="mother">
                      {tParents("relationshipMother")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm break-words">
                  {parent2Relationship
                    ? getRelationshipLabel(parent2Relationship)
                    : "-"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("email")}
              </p>
              {isEditing ? (
                <Input
                  type="email"
                  value={editData.parent2Email}
                  onChange={(e) =>
                    handleFieldChange("parent2Email", e.target.value)
                  }
                  placeholder={tParents("emailPlaceholder")}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm break-words">{parent2Email || "-"}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                {t("phone")}
              </p>
              {isEditing ? (
                <Input
                  type="tel"
                  value={editData.parent2Telephone}
                  onChange={(e) =>
                    handleFieldChange("parent2Telephone", e.target.value)
                  }
                  placeholder={tParents("telephonePlaceholder")}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm break-words">{parent2Telephone || "-"}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}