import type { ProgramFormElementType } from "./types";
import type { ProgramFormCopy } from "./utils";

type TranslationFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const ELEMENT_KEY_BY_TYPE: Record<ProgramFormElementType, string> = {
  Text: "text",
  Separator: "separator",
  Input: "input",
  Textarea: "textarea",
  Checkbox: "checkbox",
  Switch: "switch",
  Select: "select",
  RadioGroup: "radioGroup",
  DatePicker: "datePicker",
};

export function createProgramFormCopy(t: TranslationFn): ProgramFormCopy {
  return {
    stepTitle: (current) => t("defaults.stepLabel", { current }),
    optionLabel: (current) => t("defaults.optionLabel", { current }),
    elementLabel: (fieldType) =>
      t(`defaults.elements.${ELEMENT_KEY_BY_TYPE[fieldType]}.label`),
    elementPlaceholder: (fieldType) =>
      t(`defaults.elements.${ELEMENT_KEY_BY_TYPE[fieldType]}.placeholder`),
    textContent: () => t("defaults.elements.text.content"),
  };
}
