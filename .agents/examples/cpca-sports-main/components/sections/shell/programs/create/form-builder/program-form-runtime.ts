import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  ProgramFormDefinition,
  ProgramFormElement,
  ProgramFormValues,
} from "./types";
import { isStaticElement } from "./utils";

type StoredProgramFormValue =
  | string
  | number
  | boolean
  | null
  | Id<"_storage">;

type StoredProgramFormData = Record<
  string,
  Record<string, StoredProgramFormValue>
>;

function createLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function parseStoredDateRange(value: string) {
  try {
    const parsed = JSON.parse(value) as { from?: string; to?: string };
    if (!parsed.from || !parsed.to) {
      return undefined;
    }

    const from = createLocalDate(parsed.from);
    const to = createLocalDate(parsed.to);
    if (!from || !to) {
      return undefined;
    }

    return { from, to } satisfies DateRange;
  } catch {
    return undefined;
  }
}

function deserializeProgramFormValue(
  element: ProgramFormElement,
  value: StoredProgramFormValue | undefined,
) {
  if (value == null || isStaticElement(element)) {
    return undefined;
  }

  switch (element.fieldType) {
    case "Checkbox":
    case "Switch":
      return value === true;
    case "DatePicker":
      if (typeof value !== "string") {
        return undefined;
      }
      if (element.mode === "range") {
        return parseStoredDateRange(value);
      }
      return createLocalDate(value) ?? undefined;
    case "Input":
      if (element.inputType === "number") {
        if (typeof value === "number") {
          return value;
        }

        const parsed = Number(value);
        return Number.isNaN(parsed) ? undefined : parsed;
      }

      return String(value);
    default:
      return typeof value === "string" ? value : String(value);
  }
}

export function buildInitialProgramFormValues(
  definition: ProgramFormDefinition,
  formData: StoredProgramFormData,
): ProgramFormValues {
  const values: ProgramFormValues = {};

  for (const step of definition.steps) {
    const section = formData[step.id] ?? {};
    for (const element of step.elements) {
      const value = deserializeProgramFormValue(element, section[element.name]);
      if (value !== undefined) {
        values[element.name] = value;
      }
    }
  }

  return values;
}

export function isProgramFieldValueMissing(
  element: ProgramFormElement,
  value: unknown,
) {
  if (isStaticElement(element) || !element.required) {
    return false;
  }

  if (element.fieldType === "Checkbox" || element.fieldType === "Switch") {
    return value !== true;
  }

  if (element.fieldType === "DatePicker") {
    if (element.mode === "range") {
      const range = value as DateRange | undefined;
      return !(range?.from && range.to);
    }

    return !(value instanceof Date);
  }

  if (typeof value === "number") {
    return Number.isNaN(value);
  }

  return String(value ?? "").trim() === "";
}

export function serializeProgramFormValue(
  element: ProgramFormElement,
  value: unknown,
): StoredProgramFormValue | undefined {
  if (isStaticElement(element)) {
    return undefined;
  }

  if (element.fieldType === "Checkbox" || element.fieldType === "Switch") {
    return value === true;
  }

  if (element.fieldType === "DatePicker") {
    if (element.mode === "range") {
      const range = value as DateRange | undefined;
      if (!range?.from || !range.to) {
        return undefined;
      }

      return JSON.stringify({
        from: format(range.from, "yyyy-MM-dd"),
        to: format(range.to, "yyyy-MM-dd"),
      });
    }

    if (!(value instanceof Date)) {
      return undefined;
    }

    return format(value, "yyyy-MM-dd");
  }

  if (typeof value === "number") {
    return Number.isNaN(value) ? undefined : value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim();
  return normalized ? normalized : undefined;
}

export function buildProgramFormData(
  definition: ProgramFormDefinition,
  values: ProgramFormValues,
): StoredProgramFormData {
  return definition.steps.reduce<StoredProgramFormData>((result, step) => {
    const section = step.elements.reduce<Record<string, StoredProgramFormValue>>(
      (current, element) => {
        const value = serializeProgramFormValue(element, values[element.name]);
        if (value === undefined) {
          return current;
        }

        current[element.name] = value;
        return current;
      },
      {},
    );

    if (Object.keys(section).length > 0) {
      result[step.id] = section;
    }

    return result;
  }, {});
}
