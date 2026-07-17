"use client";

import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Radio, RadioField, RadioGroup } from "@/components/ui/radio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  ProgramFormElement,
  ProgramFormErrors,
  ProgramFormValues,
} from "./types";

interface RenderProgramFormElementProps {
  element: ProgramFormElement;
  values: ProgramFormValues;
  errors: ProgramFormErrors;
  onChange: (name: string, value: unknown) => void;
}

function getError(errors: ProgramFormErrors, name: string) {
  return errors[name] ? [{ message: errors[name] }] : undefined;
}

function getInputType(type: string) {
  return type === "number" ? "number" : type;
}

function renderLabelContent(
  label: string | undefined,
  required?: boolean,
  description?: string,
) {
  return (
    <>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {description ? (
        <span className="text-xs font-normal text-muted-foreground">
          ({description})
        </span>
      ) : null}
    </>
  );
}

export function RenderProgramFormElement({
  element,
  values,
  errors,
  onChange,
}: RenderProgramFormElementProps) {
  const error = getError(errors, element.name);

  switch (element.fieldType) {
    case "Text":
      if (element.variant === "H1") {
        return <h1 className="text-3xl font-bold">{element.content}</h1>;
      }

      if (element.variant === "H2") {
        return <h2 className="text-2xl font-semibold">{element.content}</h2>;
      }

      if (element.variant === "H3") {
        return <h3 className="text-lg font-semibold">{element.content}</h3>;
      }

      return <p className="text-sm text-muted-foreground">{element.content}</p>;

    case "Separator":
      return <FieldSeparator>{element.label}</FieldSeparator>;

    case "Input":
      return (
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={element.name}>
            {renderLabelContent(
              element.label,
              element.required,
              element.description,
            )}
          </FieldLabel>
          <Input
            id={element.name}
            type={getInputType(element.inputType)}
            value={(values[element.name] as string | number | undefined) ?? ""}
            onChange={(event) =>
              onChange(
                element.name,
                element.inputType === "number"
                  ? event.target.value === ""
                    ? ""
                    : Number(event.target.value)
                  : event.target.value,
              )
            }
            placeholder={element.placeholder}
            disabled={element.disabled}
            aria-invalid={!!error}
          />
          <FieldError errors={error} />
        </Field>
      );

    case "Textarea":
      return (
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={element.name}>
            {renderLabelContent(
              element.label,
              element.required,
              element.description,
            )}
          </FieldLabel>
          <Textarea
            id={element.name}
            value={(values[element.name] as string | undefined) ?? ""}
            onChange={(event) => onChange(element.name, event.target.value)}
            placeholder={element.placeholder}
            disabled={element.disabled}
            aria-invalid={!!error}
            className="resize-none"
          />
          <FieldError errors={error} />
        </Field>
      );

    case "Checkbox":
      return (
        <Field data-invalid={!!error} data-disabled={element.disabled}>
          <div className="flex items-center gap-2">
            <Checkbox
              id={element.name}
              checked={Boolean(values[element.name])}
              onCheckedChange={(checked) =>
                onChange(element.name, checked === true)
              }
              disabled={element.disabled}
              aria-invalid={!!error}
            />
            <FieldLabel htmlFor={element.name}>
              {renderLabelContent(
                element.label,
                element.required,
                element.description,
              )}
            </FieldLabel>
          </div>
          <FieldError errors={error} />
        </Field>
      );

    case "Switch":
      return (
        <Field
          orientation="horizontal"
          data-invalid={!!error}
          data-disabled={element.disabled}
        >
          <FieldContent>
            <FieldLabel htmlFor={element.name}>
              {renderLabelContent(
                element.label,
                element.required,
                element.description,
              )}
            </FieldLabel>
            <FieldError errors={error} />
          </FieldContent>
          <Switch
            checked={Boolean(values[element.name])}
            onChange={(checked) => onChange(element.name, checked)}
            disabled={element.disabled}
          />
        </Field>
      );

    case "Select":
      return (
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={element.name}>
            {renderLabelContent(
              element.label,
              element.required,
              element.description,
            )}
          </FieldLabel>
          <Select
            value={(values[element.name] as string | undefined) ?? ""}
            onValueChange={(value) => onChange(element.name, value)}
            disabled={element.disabled}
          >
            <SelectTrigger id={element.name} className="w-full">
              <SelectValue placeholder={element.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {element.options.map((option) => (
                <SelectItem key={option.id} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={error} />
        </Field>
      );

    case "RadioGroup":
      return (
        <Field data-invalid={!!error}>
          <FieldLabel>
            {renderLabelContent(
              element.label,
              element.required,
              element.description,
            )}
          </FieldLabel>
          <RadioGroup
            value={(values[element.name] as string | undefined) ?? ""}
            onChange={(value) => onChange(element.name, value)}
            disabled={element.disabled}
            className="pt-1"
          >
            {element.options.map((option) => (
              <RadioField key={option.id}>
                <Radio value={option.value} />
                <Label>{option.label}</Label>
              </RadioField>
            ))}
          </RadioGroup>
          <FieldError errors={error} />
        </Field>
      );

    case "DatePicker": {
      const value = values[element.name];
      const singleValue = value instanceof Date ? value : undefined;
      const rangeValue =
        value && typeof value === "object" && "from" in (value as DateRange)
          ? (value as DateRange)
          : undefined;

      return (
        <Field data-invalid={!!error}>
          <FieldLabel>
            {renderLabelContent(
              element.label,
              element.required,
              element.description,
            )}
          </FieldLabel>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={element.disabled}
                className={cn(
                  "w-full justify-between font-normal",
                  !value && "text-muted-foreground",
                )}
              >
                <span>
                  {element.mode === "range"
                    ? rangeValue?.from
                      ? `${format(rangeValue.from, "PPP")}${
                          rangeValue.to
                            ? ` - ${format(rangeValue.to, "PPP")}`
                            : ""
                        }`
                      : element.placeholder
                    : singleValue
                      ? format(singleValue, "PPP")
                      : element.placeholder}
                </span>
                <CalendarIcon className="size-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              {element.mode === "range" ? (
                <Calendar
                  mode="range"
                  selected={rangeValue}
                  onSelect={(selected: DateRange | undefined) =>
                    onChange(element.name, selected)
                  }
                  initialFocus
                />
              ) : (
                <Calendar
                  mode="single"
                  selected={singleValue}
                  onSelect={(selected: Date | undefined) =>
                    onChange(element.name, selected)
                  }
                  initialFocus
                />
              )}
            </PopoverContent>
          </Popover>
          <FieldError errors={error} />
        </Field>
      );
    }
  }
}

export function getPreviewWidthClass(element: ProgramFormElement) {
  return cn("col-span-full", element.width ?? "col-span-full");
}
