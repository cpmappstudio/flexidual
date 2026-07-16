import type { Doc } from "@/convex/_generated/dataModel";
import { getProgramFormStepTitle } from "./program-form-step-icons";
import { isFieldElement } from "./utils";
import type { ProgramFormDefinition, ProgramFormFieldElement } from "./types";

function getTemplateFieldType(element: ProgramFormFieldElement) {
  switch (element.fieldType) {
    case "Input":
      return element.inputType;
    case "Textarea":
      return "textarea";
    case "Checkbox":
    case "Switch":
      return "checkbox";
    case "Select":
    case "RadioGroup":
      return "select";
    case "DatePicker":
      return "date";
  }
}

export function buildTemplateSectionsFromProgramForm(
  definition: ProgramFormDefinition,
  getFallbackStepTitle: (index: number) => string = (index) =>
    `Step ${index + 1}`,
): Doc<"formTemplates">["sections"] {
  return definition.steps.map((step, index) => ({
    key: step.id,
    label: getProgramFormStepTitle(step, index, getFallbackStepTitle(index)),
    order: index,
    fields: step.elements.filter(isFieldElement).map((element) => ({
      key: element.name.trim(),
      label: element.label?.trim() || element.name.trim(),
      type: getTemplateFieldType(element),
      required: Boolean(element.required),
    })),
  }));
}
