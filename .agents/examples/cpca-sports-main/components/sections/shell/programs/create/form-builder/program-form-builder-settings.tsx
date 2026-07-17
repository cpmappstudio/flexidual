"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isStaticElement } from "./utils";
import type {
  ProgramFormElement,
  ProgramFormOption,
  ProgramFormTextElement,
} from "./types";

const WIDTH_OPTIONS = [
  { value: "col-span-full", labelKey: "full" },
  { value: "md:col-span-3", labelKey: "half" },
  { value: "md:col-span-2", labelKey: "third" },
] as const;

const INPUT_TYPE_OPTIONS = ["text", "email", "number", "tel", "url"] as const;
const TEXT_VARIANTS = ["H1", "H2", "H3", "P"] as const;
const DATE_MODE_OPTIONS = ["single", "range"] as const;

function OptionEditor({
  options,
  onChange,
}: {
  options: ProgramFormOption[];
  onChange: (options: ProgramFormOption[]) => void;
}) {
  const t = useTranslations("Programs.create.builder");

  const handleOptionChange = (
    optionId: string,
    key: "label" | "value",
    value: string,
  ) => {
    onChange(
      options.map((option) =>
        option.id === optionId ? { ...option, [key]: value } : option,
      ),
    );
  };

  const handleAddOption = () => {
    const index = options.length + 1;
    onChange([
      ...options,
      {
        id: `option-${Date.now()}-${index}`,
        label: `Option ${index}`,
        value: `option-${index}`,
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t("settings.fields.options")}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddOption}
        >
          <Plus className="size-4" />
          {t("settings.actions.addOption")}
        </Button>
      </div>
      <div className="space-y-3">
        {options.map((option) => (
          <div key={option.id} className="grid gap-3 rounded-lg border p-3">
            <div className="space-y-2">
              <Label>{t("settings.fields.optionLabel")}</Label>
              <Input
                value={option.label}
                onChange={(event) =>
                  handleOptionChange(option.id, "label", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.fields.optionValue")}</Label>
              <div className="flex gap-2">
                <Input
                  value={option.value}
                  onChange={(event) =>
                    handleOptionChange(option.id, "value", event.target.value)
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    onChange(
                      options.filter((current) => current.id !== option.id),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProgramFormElementSettingsProps {
  element: ProgramFormElement;
  nameError?: "required" | "duplicate";
  onChange: (
    updater: (element: ProgramFormElement) => ProgramFormElement,
  ) => void;
}

export function ProgramFormElementSettings({
  element,
  nameError,
  onChange,
}: ProgramFormElementSettingsProps) {
  const t = useTranslations("Programs.create.builder");
  const isStatic = isStaticElement(element);
  const editableField = isStatic ? null : element;

  const update = (
    updater: (current: ProgramFormElement) => ProgramFormElement,
  ) => {
    onChange(updater);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>{t("settings.fields.fieldKey")}</Label>
        <Badge
          variant="outline"
          className="h-8 rounded-md bg-muted px-3 font-mono text-[11px] text-muted-foreground"
        >
          {element.name}
        </Badge>
        {nameError ? (
          <FieldDescription className="text-destructive">
            {nameError === "required"
              ? t("settings.validation.nameRequired")
              : t("settings.validation.nameUnique")}
          </FieldDescription>
        ) : null}
      </div>

      {editableField ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="builder-element-label">
              {t("settings.fields.label")}
            </Label>
            <Input
              id="builder-element-label"
              value={editableField.label ?? ""}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="builder-element-description">
              {t("settings.fields.description")}
            </Label>
            <Textarea
              id="builder-element-description"
              value={editableField.description ?? ""}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="min-h-24 resize-none"
            />
          </div>
        </>
      ) : null}

      <div className="space-y-2">
        <Label>{t("settings.fields.width")}</Label>
        <Select
          value={element.width ?? "col-span-full"}
          onValueChange={(value) =>
            update((current) => ({
              ...current,
              width: value as ProgramFormElement["width"],
            }))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WIDTH_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(`settings.widths.${option.labelKey}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {editableField ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="inline-flex items-center gap-2">
            <Label htmlFor="builder-element-required">
              {t("settings.fields.required")}
            </Label>
            <input
              id="builder-element-required"
              type="checkbox"
              checked={Boolean(editableField.required)}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  required: event.target.checked,
                }))
              }
              className="size-4"
            />
          </div>
          <div className="inline-flex items-center gap-2">
            <Label htmlFor="builder-element-disabled">
              {t("settings.fields.disabled")}
            </Label>
            <input
              id="builder-element-disabled"
              type="checkbox"
              checked={Boolean(editableField.disabled)}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  disabled: event.target.checked,
                }))
              }
              className="size-4"
            />
          </div>
        </div>
      ) : null}

      {element.fieldType === "Text" ? (
        <>
          <div className="space-y-2">
            <Label>{t("settings.fields.textVariant")}</Label>
            <Select
              value={element.variant}
              onValueChange={(value) =>
                update((current) => ({
                  ...(current as ProgramFormTextElement),
                  variant: value as ProgramFormTextElement["variant"],
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEXT_VARIANTS.map((variant) => (
                  <SelectItem key={variant} value={variant}>
                    {t(`settings.textVariants.${variant}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="builder-element-content">
              {t("settings.fields.content")}
            </Label>
            <Textarea
              id="builder-element-content"
              value={element.content}
              onChange={(event) =>
                update((current) => ({
                  ...(current as ProgramFormTextElement),
                  content: event.target.value,
                }))
              }
              className="min-h-28 resize-none"
            />
          </div>
        </>
      ) : null}

      {element.fieldType === "Separator" ? (
        <div className="space-y-2">
          <Label htmlFor="builder-element-separator-label">
            {t("settings.fields.label")}
          </Label>
          <Input
            id="builder-element-separator-label"
            value={element.label ?? ""}
            onChange={(event) =>
              update((current) => ({
                ...current,
                label: event.target.value,
              }))
            }
          />
          <FieldDescription>{t("settings.separatorHelp")}</FieldDescription>
        </div>
      ) : null}

      {(element.fieldType === "Input" ||
        element.fieldType === "Textarea" ||
        element.fieldType === "Select" ||
        element.fieldType === "DatePicker") && (
        <div className="space-y-2">
          <Label htmlFor="builder-element-placeholder">
            {t("settings.fields.placeholder")}
          </Label>
          <Input
            id="builder-element-placeholder"
            value={element.placeholder ?? ""}
            onChange={(event) =>
              update((current) => ({
                ...current,
                placeholder: event.target.value,
              }))
            }
          />
        </div>
      )}

      {element.fieldType === "Input" ? (
        <div className="space-y-2">
          <Label>{t("settings.fields.inputType")}</Label>
          <Select
            value={element.inputType}
            onValueChange={(value) =>
              update((current) => ({
                ...current,
                inputType: value as typeof element.inputType,
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INPUT_TYPE_OPTIONS.map((inputType) => (
                <SelectItem key={inputType} value={inputType}>
                  {t(`settings.inputTypes.${inputType}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {element.fieldType === "DatePicker" ? (
        <div className="space-y-2">
          <Label>{t("settings.fields.dateMode")}</Label>
          <Select
            value={element.mode}
            onValueChange={(value) =>
              update((current) => ({
                ...current,
                mode: value as typeof element.mode,
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_MODE_OPTIONS.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`settings.dateModes.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {element.fieldType === "Select" || element.fieldType === "RadioGroup" ? (
        <OptionEditor
          options={element.options}
          onChange={(options) =>
            update((current) => ({
              ...current,
              options,
            }))
          }
        />
      ) : null}
    </div>
  );
}
