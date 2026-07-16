import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CaseSensitive,
  CheckSquare,
  CircleDot,
  ListFilter,
  Minus,
  Pilcrow,
  TextCursorInput,
  ToggleLeft,
} from "lucide-react";
import type { ProgramFormElementType } from "./types";

export interface ProgramFormCatalogItem {
  fieldType: ProgramFormElementType;
  labelKey: string;
  descriptionKey: string;
  group: "fields" | "display";
  icon: LucideIcon;
}

export const PROGRAM_FORM_CATALOG: ProgramFormCatalogItem[] = [
  {
    fieldType: "Input",
    labelKey: "editor.catalog.Input.label",
    descriptionKey: "editor.catalog.Input.description",
    group: "fields",
    icon: TextCursorInput,
  },
  {
    fieldType: "Textarea",
    labelKey: "editor.catalog.Textarea.label",
    descriptionKey: "editor.catalog.Textarea.description",
    group: "fields",
    icon: Pilcrow,
  },
  {
    fieldType: "Checkbox",
    labelKey: "editor.catalog.Checkbox.label",
    descriptionKey: "editor.catalog.Checkbox.description",
    group: "fields",
    icon: CheckSquare,
  },
  {
    fieldType: "Switch",
    labelKey: "editor.catalog.Switch.label",
    descriptionKey: "editor.catalog.Switch.description",
    group: "fields",
    icon: ToggleLeft,
  },
  {
    fieldType: "Select",
    labelKey: "editor.catalog.Select.label",
    descriptionKey: "editor.catalog.Select.description",
    group: "fields",
    icon: ListFilter,
  },
  {
    fieldType: "RadioGroup",
    labelKey: "editor.catalog.RadioGroup.label",
    descriptionKey: "editor.catalog.RadioGroup.description",
    group: "fields",
    icon: CircleDot,
  },
  {
    fieldType: "DatePicker",
    labelKey: "editor.catalog.DatePicker.label",
    descriptionKey: "editor.catalog.DatePicker.description",
    group: "fields",
    icon: CalendarDays,
  },
  {
    fieldType: "Text",
    labelKey: "editor.catalog.Text.label",
    descriptionKey: "editor.catalog.Text.description",
    group: "display",
    icon: CaseSensitive,
  },
  {
    fieldType: "Separator",
    labelKey: "editor.catalog.Separator.label",
    descriptionKey: "editor.catalog.Separator.description",
    group: "display",
    icon: Minus,
  },
];

export function getCatalogItem(fieldType: ProgramFormElementType) {
  return PROGRAM_FORM_CATALOG.find((item) => item.fieldType === fieldType);
}
