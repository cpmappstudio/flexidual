import type { Doc } from "@/convex/_generated/dataModel";
import {
  isLegacyImportedTemplateMissingDefinition,
  legacyPreadmissionFormDefinition,
} from "@/lib/forms/legacy-preadmission-template";
import type {
  ProgramFormDefinition,
  ProgramFormElement,
  ProgramFormElementType,
} from "./types";
import {
  DEFAULT_PROGRAM_FORM_COPY,
  createDefaultElement,
  createEmptyFormDefinition,
  parseProgramFormDefinition,
  type ProgramFormCopy,
} from "./utils";

function createDefaultElementOfType<T extends ProgramFormElementType>(
  fieldType: T,
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
) {
  return createDefaultElement(fieldType, copy) as Extract<
    ProgramFormElement,
    { fieldType: T }
  >;
}

function createElementFromTemplateField(
  field: Doc<"formTemplates">["sections"][number]["fields"][number],
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormElement {
  switch (field.type) {
    case "date": {
      const element = createDefaultElementOfType("DatePicker", copy);
      return {
        ...element,
        name: field.key,
        label: field.label,
        required: field.required,
        placeholder: field.label,
        mode: "single",
      };
    }
    case "textarea": {
      const element = createDefaultElementOfType("Textarea", copy);
      return {
        ...element,
        name: field.key,
        label: field.label,
        required: field.required,
        placeholder: field.label,
      };
    }
    case "checkbox": {
      const element = createDefaultElementOfType("Checkbox", copy);
      return {
        ...element,
        name: field.key,
        label: field.label,
        required: field.required,
      };
    }
    case "select": {
      const element = createDefaultElementOfType("Select", copy);
      return {
        ...element,
        name: field.key,
        label: field.label,
        required: field.required,
        placeholder: field.label,
        options: [],
      };
    }
    default: {
      const element = createDefaultElementOfType("Input", copy);
      const inputType =
        field.type === "email" ||
        field.type === "number" ||
        field.type === "tel" ||
        field.type === "url"
          ? field.type
          : "text";

      return {
        ...element,
        name: field.key,
        label: field.label,
        required: field.required,
        inputType,
        placeholder: field.label,
      };
    }
  }
}

function buildProgramFormDefinitionFromSections(
  sections: Doc<"formTemplates">["sections"],
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormDefinition {
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  if (sortedSections.length === 0) {
    return createEmptyFormDefinition(copy);
  }

  return {
    version: 1,
    isMultiStep: sortedSections.length > 1,
    steps: sortedSections.map((section, index) => ({
      id: section.key || `step-${index + 1}`,
      title: section.label || copy.stepTitle(index + 1),
      icon: "number",
      elements: section.fields.map((field) =>
        createElementFromTemplateField(field, copy),
      ),
    })),
  };
}

export function buildProgramFormDefinitionFromTemplate(
  template: Doc<"formTemplates">,
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
) {
  if (isLegacyImportedTemplateMissingDefinition(template)) {
    return legacyPreadmissionFormDefinition;
  }

  if (template.formDefinition) {
    const parsedDefinition = parseProgramFormDefinition(
      template.formDefinition,
      copy,
    );
    const hasParsedElements = parsedDefinition.steps.some(
      (step) => step.elements.length > 0,
    );

    if (hasParsedElements || template.sections.length === 0) {
      return parsedDefinition;
    }
  }

  return buildProgramFormDefinitionFromSections(template.sections, copy);
}
