"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ErrorHandler,
  handleDocumentTypeError,
} from "./document-type-shared";

interface AddDocumentTypeFormProps {
  onAddDocument: (document: {
    name: string;
    description?: string;
    required: boolean;
  }) => Promise<void>;
  onClose: () => void;
  onError?: ErrorHandler;
}

export function AddDocumentTypeForm({
  onAddDocument,
  onClose,
  onError,
}: AddDocumentTypeFormProps) {
  const t = useTranslations("Applications.documents");
  const id = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newDocument, setNewDocument] = useState({
    name: "",
    description: "",
    required: false,
  });

  const handleAdd = async () => {
    const trimmedName = newDocument.name.trim();
    if (!trimmedName) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddDocument({
        name: trimmedName,
        description: newDocument.description.trim() || undefined,
        required: newDocument.required,
      });
      setNewDocument({ name: "", description: "", required: false });
      onClose();
    } catch (error) {
      handleDocumentTypeError(error, onError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-document-name`}>{t("form.documentName")}</Label>
            <Input
              id={`${id}-document-name`}
              placeholder={t("form.documentNamePlaceholder")}
              value={newDocument.name}
              onChange={(event) =>
                setNewDocument((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-document-description`}>
              {t("form.description")}
            </Label>
            <Input
              id={`${id}-document-description`}
              placeholder={t("form.descriptionPlaceholder")}
              value={newDocument.description}
              onChange={(event) =>
                setNewDocument((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`${id}-document-required`}
            checked={newDocument.required}
            onChange={(event) =>
              setNewDocument((current) => ({
                ...current,
                required: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label
            htmlFor={`${id}-document-required`}
            className="cursor-pointer"
          >
            {t("form.required")}
          </Label>
        </div>
        <Button
          onClick={handleAdd}
          className="w-full"
          disabled={isSubmitting || !newDocument.name.trim()}
        >
          {isSubmitting ? t("form.adding") : t("form.addButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
