export type ProgramFormWidth =
  | "col-span-full"
  | "md:col-span-3"
  | "md:col-span-2";

type BaseElement = {
  id: string;
  name: string;
  width?: ProgramFormWidth;
};

type BaseFieldElement = BaseElement & {
  label?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
};

export type ProgramFormOption = {
  id: string;
  label: string;
  value: string;
};

export type ProgramFormStepIcon =
  | "number"
  | "athlete"
  | "address"
  | "school"
  | "parents"
  | "general";

export type ProgramFormTextElement = BaseElement & {
  fieldType: "Text";
  static: true;
  variant: "H1" | "H2" | "H3" | "P";
  content: string;
};

export type ProgramFormSeparatorElement = BaseElement & {
  fieldType: "Separator";
  static: true;
  label?: string;
};

export type ProgramFormInputElement = BaseFieldElement & {
  fieldType: "Input";
  inputType: "text" | "email" | "number" | "tel" | "url";
  placeholder?: string;
};

export type ProgramFormTextareaElement = BaseFieldElement & {
  fieldType: "Textarea";
  placeholder?: string;
};

export type ProgramFormCheckboxElement = BaseFieldElement & {
  fieldType: "Checkbox";
};

export type ProgramFormSwitchElement = BaseFieldElement & {
  fieldType: "Switch";
};

export type ProgramFormSelectElement = BaseFieldElement & {
  fieldType: "Select";
  placeholder?: string;
  options: ProgramFormOption[];
};

export type ProgramFormRadioGroupElement = BaseFieldElement & {
  fieldType: "RadioGroup";
  options: ProgramFormOption[];
};

export type ProgramFormDatePickerElement = BaseFieldElement & {
  fieldType: "DatePicker";
  placeholder?: string;
  mode: "single" | "range";
};

export type ProgramFormElement =
  | ProgramFormTextElement
  | ProgramFormSeparatorElement
  | ProgramFormInputElement
  | ProgramFormTextareaElement
  | ProgramFormCheckboxElement
  | ProgramFormSwitchElement
  | ProgramFormSelectElement
  | ProgramFormRadioGroupElement
  | ProgramFormDatePickerElement;

export type ProgramFormFieldElement = Exclude<
  ProgramFormElement,
  ProgramFormTextElement | ProgramFormSeparatorElement
>;

export type ProgramFormElementType = ProgramFormElement["fieldType"];

export type ProgramFormStep = {
  id: string;
  title: string;
  icon: ProgramFormStepIcon;
  elements: ProgramFormElement[];
};

export type ProgramFormDefinition = {
  version: 1;
  isMultiStep: boolean;
  steps: ProgramFormStep[];
};

export type ProgramFormValues = Record<string, unknown>;
export type ProgramFormErrors = Record<string, string>;
