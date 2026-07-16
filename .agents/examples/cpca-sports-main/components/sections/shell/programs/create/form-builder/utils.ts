import type {
  ProgramFormDefinition,
  ProgramFormElement,
  ProgramFormElementType,
  ProgramFormFieldElement,
  ProgramFormOption,
  ProgramFormStepIcon,
  ProgramFormStep,
  ProgramFormWidth,
} from "./types";

export interface ProgramFormCopy {
  stepTitle: (current: number) => string;
  optionLabel: (current: number) => string;
  elementLabel: (fieldType: ProgramFormElementType) => string;
  elementPlaceholder: (fieldType: ProgramFormElementType) => string;
  textContent: () => string;
}

export const DEFAULT_PROGRAM_FORM_COPY: ProgramFormCopy = {
  stepTitle: (current) => `Step ${current}`,
  optionLabel: (current) => `Option ${current}`,
  elementLabel: (fieldType) => {
    switch (fieldType) {
      case "Input":
        return "Text field";
      case "Textarea":
        return "Textarea";
      case "Checkbox":
        return "Checkbox";
      case "Switch":
        return "Switch";
      case "Select":
        return "Select";
      case "RadioGroup":
        return "Radio group";
      case "DatePicker":
        return "Date picker";
      case "Text":
        return "Text";
      case "Separator":
        return "Separator";
    }
  },
  elementPlaceholder: (fieldType) => {
    switch (fieldType) {
      case "Input":
        return "Enter a value";
      case "Textarea":
        return "Write your answer";
      case "Select":
        return "Choose an option";
      case "DatePicker":
        return "Select a date";
      default:
        return "";
    }
  },
  textContent: () => "Section title",
};

const VALID_WIDTHS = new Set([
  "col-span-full",
  "md:col-span-3",
  "md:col-span-2",
]);
const VALID_TEXT_VARIANTS = new Set(["H1", "H2", "H3", "P"]);
const VALID_INPUT_TYPES = new Set(["text", "email", "number", "tel", "url"]);
const VALID_DATE_MODES = new Set(["single", "range"]);
const VALID_STEP_ICONS = new Set<ProgramFormStepIcon>([
  "number",
  "athlete",
  "address",
  "school",
  "parents",
  "general",
]);
const VALID_FIELD_TYPES = new Set<ProgramFormElementType>([
  "Text",
  "Separator",
  "Input",
  "Textarea",
  "Checkbox",
  "Switch",
  "Select",
  "RadioGroup",
  "DatePicker",
]);

function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}-${random}`;
}

function createOption(label: string, value: string): ProgramFormOption {
  return {
    id: createId("option"),
    label,
    value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function normalizeBoolean(value: unknown, fallback?: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeWidth(
  value: unknown,
  fallback: ProgramFormWidth = "col-span-full",
) {
  return typeof value === "string" && VALID_WIDTHS.has(value)
    ? (value as ProgramFormWidth)
    : fallback;
}

function normalizeOptions(
  value: unknown,
  fallback: ProgramFormOption[],
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormOption[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const options = value
    .map((option, index) => {
      if (!isRecord(option)) {
        return null;
      }

      return {
        id: normalizeString(option.id, createId("option")),
        label: normalizeString(option.label, copy.optionLabel(index + 1)),
        value: normalizeString(option.value, `option-${index + 1}`),
      };
    })
    .filter((option): option is ProgramFormOption => option !== null);

  return options.length > 0 ? options : fallback;
}

export function createEmptyStep(
  index = 0,
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormStep {
  return {
    id: createId("step"),
    title: copy.stepTitle(index + 1),
    icon: "number",
    elements: [],
  };
}

export function createEmptyFormDefinition(
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormDefinition {
  return {
    version: 1,
    isMultiStep: false,
    steps: [createEmptyStep(0, copy)],
  };
}

export function createDefaultElement(
  fieldType: ProgramFormElementType,
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormElement {
  const id = createId(fieldType.toLowerCase());
  const base = {
    id,
    name: `${fieldType.toLowerCase()}_${id.slice(-4)}`,
    width: "col-span-full" as const,
  };

  switch (fieldType) {
    case "Text":
      return {
        ...base,
        fieldType,
        static: true,
        variant: "H2",
        content: copy.textContent(),
      };
    case "Separator":
      return {
        ...base,
        fieldType,
        static: true,
        label: "",
      };
    case "Input":
      return {
        ...base,
        fieldType,
        label: copy.elementLabel(fieldType),
        description: "",
        required: false,
        disabled: false,
        inputType: "text",
        placeholder: copy.elementPlaceholder(fieldType),
      };
    case "Textarea":
      return {
        ...base,
        fieldType,
        label: copy.elementLabel(fieldType),
        description: "",
        required: false,
        disabled: false,
        placeholder: copy.elementPlaceholder(fieldType),
      };
    case "Checkbox":
      return {
        ...base,
        fieldType,
        label: copy.elementLabel(fieldType),
        description: "",
        required: false,
        disabled: false,
      };
    case "Switch":
      return {
        ...base,
        fieldType,
        label: copy.elementLabel(fieldType),
        description: "",
        required: false,
        disabled: false,
      };
    case "Select":
      return {
        ...base,
        fieldType,
        label: copy.elementLabel(fieldType),
        description: "",
        required: false,
        disabled: false,
        placeholder: copy.elementPlaceholder(fieldType),
        options: [
          createOption(copy.optionLabel(1), "option-1"),
          createOption(copy.optionLabel(2), "option-2"),
        ],
      };
    case "RadioGroup":
      return {
        ...base,
        fieldType,
        label: copy.elementLabel(fieldType),
        description: "",
        required: false,
        disabled: false,
        options: [
          createOption(copy.optionLabel(1), "option-1"),
          createOption(copy.optionLabel(2), "option-2"),
        ],
      };
    case "DatePicker":
      return {
        ...base,
        fieldType,
        label: copy.elementLabel(fieldType),
        description: "",
        required: false,
        disabled: false,
        placeholder: copy.elementPlaceholder(fieldType),
        mode: "single",
      };
  }
}

function normalizeElement(
  value: unknown,
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormElement | null {
  if (!isRecord(value)) {
    return null;
  }

  const fieldType = value.fieldType;
  if (
    typeof fieldType !== "string" ||
    !VALID_FIELD_TYPES.has(fieldType as ProgramFormElementType)
  ) {
    return null;
  }

  const fallback = createDefaultElement(
    fieldType as ProgramFormElementType,
    copy,
  );
  const id = normalizeString(value.id, fallback.id);
  const name = normalizeString(value.name, fallback.name);
  const width = normalizeWidth(value.width, fallback.width);

  switch (fieldType) {
    case "Text": {
      const textFallback = fallback as Extract<
        ProgramFormElement,
        { fieldType: "Text" }
      >;
      return {
        id,
        name,
        width,
        fieldType,
        static: true,
        variant:
          typeof value.variant === "string" &&
          VALID_TEXT_VARIANTS.has(value.variant)
            ? (value.variant as "H1" | "H2" | "H3" | "P")
            : textFallback.variant,
        content: normalizeString(value.content, textFallback.content),
      };
    }
    case "Separator":
      return {
        id,
        name,
        width,
        fieldType,
        static: true,
        label: normalizeOptionalString(value.label),
      };
    case "Input": {
      const inputFallback = fallback as Extract<
        ProgramFormElement,
        { fieldType: "Input" }
      >;
      return {
        id,
        name,
        width,
        fieldType,
        label: normalizeOptionalString(value.label),
        description: normalizeOptionalString(value.description),
        required: normalizeBoolean(value.required, inputFallback.required),
        disabled: normalizeBoolean(value.disabled, inputFallback.disabled),
        inputType:
          typeof value.inputType === "string" &&
          VALID_INPUT_TYPES.has(value.inputType)
            ? (value.inputType as "text" | "email" | "number" | "tel" | "url")
            : inputFallback.inputType,
        placeholder: normalizeOptionalString(value.placeholder),
      };
    }
    case "Textarea": {
      const textareaFallback = fallback as Extract<
        ProgramFormElement,
        { fieldType: "Textarea" }
      >;
      return {
        id,
        name,
        width,
        fieldType,
        label: normalizeOptionalString(value.label),
        description: normalizeOptionalString(value.description),
        required: normalizeBoolean(value.required, textareaFallback.required),
        disabled: normalizeBoolean(value.disabled, textareaFallback.disabled),
        placeholder: normalizeOptionalString(value.placeholder),
      };
    }
    case "Checkbox": {
      const checkboxFallback = fallback as Extract<
        ProgramFormElement,
        { fieldType: "Checkbox" }
      >;
      return {
        id,
        name,
        width,
        fieldType,
        label: normalizeOptionalString(value.label),
        description: normalizeOptionalString(value.description),
        required: normalizeBoolean(value.required, checkboxFallback.required),
        disabled: normalizeBoolean(value.disabled, checkboxFallback.disabled),
      };
    }
    case "Switch": {
      const switchFallback = fallback as Extract<
        ProgramFormElement,
        { fieldType: "Switch" }
      >;
      return {
        id,
        name,
        width,
        fieldType,
        label: normalizeOptionalString(value.label),
        description: normalizeOptionalString(value.description),
        required: normalizeBoolean(value.required, switchFallback.required),
        disabled: normalizeBoolean(value.disabled, switchFallback.disabled),
      };
    }
    case "Select": {
      const selectFallback = fallback as Extract<
        ProgramFormElement,
        { fieldType: "Select" }
      >;
      return {
        id,
        name,
        width,
        fieldType,
        label: normalizeOptionalString(value.label),
        description: normalizeOptionalString(value.description),
        required: normalizeBoolean(value.required, selectFallback.required),
        disabled: normalizeBoolean(value.disabled, selectFallback.disabled),
        placeholder: normalizeOptionalString(value.placeholder),
        options: normalizeOptions(value.options, selectFallback.options, copy),
      };
    }
    case "RadioGroup": {
      const radioFallback = fallback as Extract<
        ProgramFormElement,
        { fieldType: "RadioGroup" }
      >;
      return {
        id,
        name,
        width,
        fieldType,
        label: normalizeOptionalString(value.label),
        description: normalizeOptionalString(value.description),
        required: normalizeBoolean(value.required, radioFallback.required),
        disabled: normalizeBoolean(value.disabled, radioFallback.disabled),
        options: normalizeOptions(value.options, radioFallback.options, copy),
      };
    }
    case "DatePicker": {
      const dateFallback = fallback as Extract<
        ProgramFormElement,
        { fieldType: "DatePicker" }
      >;
      return {
        id,
        name,
        width,
        fieldType,
        label: normalizeOptionalString(value.label),
        description: normalizeOptionalString(value.description),
        required: normalizeBoolean(value.required, dateFallback.required),
        disabled: normalizeBoolean(value.disabled, dateFallback.disabled),
        placeholder: normalizeOptionalString(value.placeholder),
        mode:
          typeof value.mode === "string" && VALID_DATE_MODES.has(value.mode)
            ? (value.mode as "single" | "range")
            : dateFallback.mode,
      };
    }
  }

  return null;
}

function normalizeStep(
  value: unknown,
  index: number,
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormStep | null {
  if (!isRecord(value)) {
    return null;
  }

  const elements = Array.isArray(value.elements)
    ? value.elements
        .map((element) => normalizeElement(element, copy))
        .filter((element): element is ProgramFormElement => element !== null)
    : [];

  return {
    id: normalizeString(value.id, createId("step")),
    title: normalizeString(value.title, copy.stepTitle(index + 1)),
    icon:
      typeof value.icon === "string" &&
      VALID_STEP_ICONS.has(value.icon as ProgramFormStepIcon)
        ? (value.icon as ProgramFormStepIcon)
        : "number",
    elements,
  };
}

export function parseProgramFormDefinition(
  serialized?: string,
  copy: ProgramFormCopy = DEFAULT_PROGRAM_FORM_COPY,
): ProgramFormDefinition {
  if (!serialized) {
    return createEmptyFormDefinition(copy);
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;

    if (
      isRecord(parsed) &&
      parsed.version === 1 &&
      Array.isArray(parsed.steps)
    ) {
      const steps = parsed.steps
        .map((step, index) => normalizeStep(step, index, copy))
        .filter((step): step is ProgramFormStep => step !== null);

      if (steps.length > 0) {
        return {
          version: 1,
          isMultiStep: steps.length > 1,
          steps,
        };
      }
    }
  } catch {}

  return createEmptyFormDefinition(copy);
}

export function serializeProgramFormDefinition(
  definition: ProgramFormDefinition,
) {
  return JSON.stringify({
    ...definition,
    isMultiStep: definition.steps.length > 1,
  });
}

export function isStaticElement(
  element: ProgramFormElement,
): element is Extract<ProgramFormElement, { static: true }> {
  return "static" in element && element.static === true;
}

export function isFieldElement(
  element: ProgramFormElement,
): element is ProgramFormFieldElement {
  return !isStaticElement(element);
}

export function getProgramFormFieldNameErrors(
  definition: ProgramFormDefinition,
) {
  const errors: Record<string, "required" | "duplicate"> = {};
  const nameToIds = new Map<string, string[]>();

  for (const step of definition.steps) {
    for (const element of step.elements) {
      if (!isFieldElement(element)) {
        continue;
      }

      const normalizedName = element.name.trim();
      if (!normalizedName) {
        errors[element.id] = "required";
        continue;
      }

      const ids = nameToIds.get(normalizedName) ?? [];
      ids.push(element.id);
      nameToIds.set(normalizedName, ids);
    }
  }

  for (const ids of nameToIds.values()) {
    if (ids.length < 2) {
      continue;
    }

    for (const id of ids) {
      errors[id] = "duplicate";
    }
  }

  return errors;
}

export function getElementTitle(element: ProgramFormElement) {
  if (element.fieldType === "Text") {
    return element.content || "Text";
  }

  if (element.fieldType === "Separator") {
    return element.label || "Separator";
  }

  return element.label || element.name;
}

export function cloneDefinition(definition: ProgramFormDefinition) {
  return JSON.parse(JSON.stringify(definition)) as ProgramFormDefinition;
}
