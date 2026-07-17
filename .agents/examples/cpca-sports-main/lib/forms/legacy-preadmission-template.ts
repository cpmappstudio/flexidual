export const LEGACY_IMPORTED_TEMPLATE_NAME =
  "Legacy Imported Pre-admission Form";
export const LEGACY_IMPORTED_TEMPLATE_DESCRIPTION =
  "Auto-created template for legacy migration";

function createOption(id: string, label: string, value: string) {
  return { id, label, value };
}

function createInput(params: {
  id: string;
  name: string;
  label: string;
  inputType?: "text" | "email" | "number" | "tel" | "url";
  placeholder?: string;
  required?: boolean;
  width?: "col-span-full" | "md:col-span-3" | "md:col-span-2";
}) {
  return {
    id: params.id,
    name: params.name,
    fieldType: "Input" as const,
    label: params.label,
    inputType: params.inputType ?? "text",
    placeholder: params.placeholder ?? params.label,
    required: params.required ?? false,
    disabled: false,
    ...(params.width ? { width: params.width } : {}),
  };
}

function createSelect(params: {
  id: string;
  name: string;
  label: string;
  options: Array<{ id: string; label: string; value: string }>;
  placeholder?: string;
  required?: boolean;
  width?: "col-span-full" | "md:col-span-3" | "md:col-span-2";
}) {
  return {
    id: params.id,
    name: params.name,
    fieldType: "Select" as const,
    label: params.label,
    placeholder: params.placeholder ?? params.label,
    options: params.options,
    required: params.required ?? false,
    disabled: false,
    ...(params.width ? { width: params.width } : {}),
  };
}

function createDatePicker(params: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  width?: "col-span-full" | "md:col-span-3" | "md:col-span-2";
}) {
  return {
    id: params.id,
    name: params.name,
    fieldType: "DatePicker" as const,
    label: params.label,
    mode: "single" as const,
    required: params.required ?? false,
    disabled: false,
    placeholder: params.label,
    ...(params.width ? { width: params.width } : {}),
  };
}

function createTextarea(params: {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return {
    id: params.id,
    name: params.name,
    fieldType: "Textarea" as const,
    label: params.label,
    placeholder: params.placeholder ?? params.label,
    required: params.required ?? false,
    disabled: false,
  };
}

function createText(params: {
  id: string;
  name: string;
  content: string;
  variant?: "H1" | "H2" | "H3" | "P";
}) {
  return {
    id: params.id,
    name: params.name,
    fieldType: "Text" as const,
    static: true as const,
    variant: params.variant ?? "P",
    content: params.content,
  };
}

export const legacyPreadmissionTemplateSections = [
  {
    key: "athlete",
    label: "Athlete Information",
    order: 0,
    fields: [
      { key: "firstName", label: "First Name", type: "text", required: true },
      { key: "lastName", label: "Last Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "telephone", label: "Phone Number", type: "tel", required: true },
      { key: "format", label: "Format", type: "select", required: true },
      { key: "program", label: "Program", type: "select", required: true },
      {
        key: "enrollmentYear",
        label: "Enrollment Year",
        type: "number",
        required: true,
      },
      {
        key: "graduationYear",
        label: "Graduation Year",
        type: "number",
        required: true,
      },
      { key: "sex", label: "Sex", type: "select", required: true },
      {
        key: "birthDate",
        label: "Birth Date",
        type: "date",
        required: true,
      },
      {
        key: "countryOfBirth",
        label: "Country of Birth",
        type: "text",
        required: true,
      },
      {
        key: "countryOfCitizenship",
        label: "Country of Citizenship",
        type: "text",
        required: true,
      },
      { key: "height", label: "Height", type: "text", required: false },
      {
        key: "highlightsLink",
        label: "Highlights Link",
        type: "url",
        required: false,
      },
      {
        key: "gradeEntering",
        label: "Grade Entering",
        type: "select",
        required: true,
      },
      {
        key: "programOfInterest",
        label: "Program of Interest",
        type: "select",
        required: false,
      },
      {
        key: "needsI20",
        label: "Do you need an I-20?",
        type: "select",
        required: true,
      },
    ],
  },
  {
    key: "address",
    label: "Address",
    order: 1,
    fields: [
      { key: "country", label: "Country", type: "text", required: true },
      { key: "state", label: "State / Province", type: "text", required: true },
      { key: "city", label: "City", type: "text", required: true },
      {
        key: "streetAddress",
        label: "Street Address",
        type: "text",
        required: true,
      },
      {
        key: "zipCode",
        label: "ZIP / Postal Code",
        type: "text",
        required: true,
      },
    ],
  },
  {
    key: "school",
    label: "School Information",
    order: 2,
    fields: [
      {
        key: "currentSchoolName",
        label: "Current School Name",
        type: "text",
        required: true,
      },
      {
        key: "currentSchoolType",
        label: "Current School Type",
        type: "select",
        required: true,
      },
      { key: "currentGPA", label: "Current GPA", type: "text", required: true },
      {
        key: "schoolCountry",
        label: "Country",
        type: "text",
        required: true,
      },
      { key: "schoolState", label: "State", type: "text", required: true },
      { key: "schoolCity", label: "City", type: "text", required: true },
      {
        key: "referenceFullName",
        label: "Reference Full Name",
        type: "text",
        required: true,
      },
      {
        key: "referencePhone",
        label: "Reference Phone",
        type: "tel",
        required: true,
      },
      {
        key: "referenceRelationship",
        label: "Reference Relationship",
        type: "text",
        required: true,
      },
    ],
  },
  {
    key: "parents",
    label: "Parents/Guardians",
    order: 3,
    fields: [
      {
        key: "parent1FirstName",
        label: "Parent 1 First Name",
        type: "text",
        required: true,
      },
      {
        key: "parent1LastName",
        label: "Parent 1 Last Name",
        type: "text",
        required: true,
      },
      {
        key: "parent1Relationship",
        label: "Parent 1 Relationship",
        type: "select",
        required: true,
      },
      {
        key: "parent1Email",
        label: "Parent 1 Email",
        type: "email",
        required: true,
      },
      {
        key: "parent1Telephone",
        label: "Parent 1 Phone Number",
        type: "tel",
        required: true,
      },
      {
        key: "parent2FirstName",
        label: "Parent 2 First Name",
        type: "text",
        required: false,
      },
      {
        key: "parent2LastName",
        label: "Parent 2 Last Name",
        type: "text",
        required: false,
      },
      {
        key: "parent2Relationship",
        label: "Parent 2 Relationship",
        type: "select",
        required: false,
      },
      {
        key: "parent2Email",
        label: "Parent 2 Email",
        type: "email",
        required: false,
      },
      {
        key: "parent2Telephone",
        label: "Parent 2 Phone Number",
        type: "tel",
        required: false,
      },
    ],
  },
  {
    key: "general",
    label: "Additional Information",
    order: 4,
    fields: [
      {
        key: "personSubmitting",
        label: "Person Submitting",
        type: "select",
        required: true,
      },
      {
        key: "howDidYouHear",
        label: "How did you hear about us?",
        type: "select",
        required: true,
      },
      {
        key: "interestedInBoarding",
        label: "Are you interested in out boarding/housing services?",
        type: "select",
        required: true,
      },
      { key: "message", label: "Message", type: "textarea", required: false },
    ],
  },
];

export const legacyPreadmissionFormDefinition = {
  version: 1 as const,
  isMultiStep: true,
  steps: [
    {
      id: "athlete",
      title: "Athlete Information",
      icon: "athlete" as const,
      elements: [
        createText({
          id: "legacy-athlete-note",
          name: "legacyAthleteNote",
          variant: "P",
          content:
            "This imported legacy form mirrors the original pre-admission flow. Applicant photo was part of that flow, but the current builder does not include a photo field.",
        }),
        createInput({
          id: "first-name",
          name: "firstName",
          label: "First Name",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "last-name",
          name: "lastName",
          label: "Last Name",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "email",
          name: "email",
          label: "Email",
          inputType: "email",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "telephone",
          name: "telephone",
          label: "Phone Number",
          inputType: "tel",
          required: true,
          width: "md:col-span-2",
        }),
        createSelect({
          id: "format",
          name: "format",
          label: "Format",
          required: true,
          width: "md:col-span-2",
          options: [
            createOption("format-american", "American Citizen / Resident", "american"),
            createOption(
              "format-international",
              "International F-1 / I-20",
              "international",
            ),
          ],
        }),
        createSelect({
          id: "program",
          name: "program",
          label: "Program",
          required: true,
          width: "md:col-span-2",
          options: [
            createOption("program-baseball", "Baseball", "baseball"),
            createOption("program-basketball", "Basketball", "basketball"),
            createOption("program-soccer", "Soccer", "soccer"),
            createOption("program-volleyball", "Volleyball", "volleyball"),
            createOption("program-hr14", "HR14 Baseball", "hr14_baseball"),
            createOption("program-golf", "Golf", "golf"),
            createOption("program-tennis", "Tennis", "tennis"),
            createOption("program-softball", "Softball", "softball"),
            createOption(
              "program-volleyball-club",
              "Volleyball Club",
              "volleyball-club",
            ),
            createOption("program-pg-basketball", "PG Basketball", "pg-basketball"),
          ],
        }),
        createInput({
          id: "enrollment-year",
          name: "enrollmentYear",
          label: "Enrollment Year",
          inputType: "number",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "graduation-year",
          name: "graduationYear",
          label: "Graduation Year",
          inputType: "number",
          required: true,
          width: "md:col-span-2",
        }),
        createSelect({
          id: "sex",
          name: "sex",
          label: "Sex",
          required: true,
          width: "md:col-span-2",
          options: [
            createOption("sex-male", "Male", "male"),
            createOption("sex-female", "Female", "female"),
            createOption("sex-other", "Other", "other"),
          ],
        }),
        createDatePicker({
          id: "birth-date",
          name: "birthDate",
          label: "Birth Date",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "country-of-birth",
          name: "countryOfBirth",
          label: "Country of Birth",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "country-of-citizenship",
          name: "countryOfCitizenship",
          label: "Country of Citizenship",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "height",
          name: "height",
          label: "Height",
          width: "md:col-span-2",
        }),
        createInput({
          id: "highlights-link",
          name: "highlightsLink",
          label: "Highlights Link",
          inputType: "url",
          width: "md:col-span-2",
        }),
        createSelect({
          id: "grade-entering",
          name: "gradeEntering",
          label: "Grade Entering",
          required: true,
          width: "md:col-span-2",
          options: [
            createOption("grade-1", "1st Grade", "1"),
            createOption("grade-2", "2nd Grade", "2"),
            createOption("grade-3", "3rd Grade", "3"),
            createOption("grade-4", "4th Grade", "4"),
            createOption("grade-5", "5th Grade", "5"),
            createOption("grade-6", "6th Grade", "6"),
            createOption("grade-7", "7th Grade", "7"),
            createOption("grade-8", "8th Grade", "8"),
            createOption("grade-9", "9th Grade", "9"),
            createOption("grade-10", "10th Grade", "10"),
            createOption("grade-11", "11th Grade", "11"),
            createOption("grade-12", "12th Grade", "12"),
            createOption(
              "grade-postgraduate",
              "Post Graduate",
              "postgraduate",
            ),
          ],
        }),
        createSelect({
          id: "program-of-interest",
          name: "programOfInterest",
          label: "Program of Interest",
          width: "md:col-span-2",
          options: [
            createOption(
              "interest-elementary",
              "Elementary (Grade 1-5)",
              "elementary",
            ),
            createOption(
              "interest-middle",
              "Middle School (Grade 6-8)",
              "middle",
            ),
            createOption(
              "interest-high",
              "High School (Grade 9-12)",
              "high",
            ),
            createOption(
              "interest-postgraduate",
              "Post Graduate",
              "postgraduate",
            ),
          ],
        }),
        createSelect({
          id: "needs-i20",
          name: "needsI20",
          label: "Do you need an I-20?",
          required: true,
          width: "md:col-span-2",
          options: [
            createOption(
              "i20-no-citizen",
              "No. I am USA Citizen / Resident",
              "no-citizen",
            ),
            createOption(
              "i20-no-non-citizen",
              "No. I don't need it and i am not citizen",
              "no-non-citizen",
            ),
            createOption(
              "i20-yes-new",
              "Yes. I need a new I-20",
              "yes-new",
            ),
            createOption(
              "i20-yes-transfer",
              "Yes. I need to transfer my I-20 to CPCA",
              "yes-transfer",
            ),
          ],
        }),
      ],
    },
    {
      id: "address",
      title: "Address",
      icon: "address" as const,
      elements: [
        createInput({
          id: "country",
          name: "country",
          label: "Country",
          required: true,
        }),
        createInput({
          id: "state",
          name: "state",
          label: "State / Province",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "city",
          name: "city",
          label: "City",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "street-address",
          name: "streetAddress",
          label: "Street Address",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "zip-code",
          name: "zipCode",
          label: "ZIP / Postal Code",
          required: true,
          width: "md:col-span-2",
        }),
      ],
    },
    {
      id: "school",
      title: "School Information",
      icon: "school" as const,
      elements: [
        createInput({
          id: "current-school-name",
          name: "currentSchoolName",
          label: "Current School Name",
          required: true,
          width: "md:col-span-2",
        }),
        createSelect({
          id: "current-school-type",
          name: "currentSchoolType",
          label: "Current School Type",
          required: true,
          width: "md:col-span-2",
          options: [
            createOption(
              "school-type-elementary",
              "Elementary (Grade 1-5)",
              "elementary",
            ),
            createOption(
              "school-type-middle",
              "Middle School (Grade 6-8)",
              "middle",
            ),
            createOption(
              "school-type-high",
              "High School (Grade 9-12)",
              "high",
            ),
            createOption(
              "school-type-postgraduate",
              "Post Graduate",
              "postgraduate",
            ),
          ],
        }),
        createInput({
          id: "current-gpa",
          name: "currentGPA",
          label: "Current GPA",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "school-country",
          name: "schoolCountry",
          label: "Country",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "school-state",
          name: "schoolState",
          label: "State",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "school-city",
          name: "schoolCity",
          label: "City",
          required: true,
          width: "md:col-span-2",
        }),
        createText({
          id: "reference-title",
          name: "referenceTitle",
          variant: "H3",
          content: "Reference Contact",
        }),
        createInput({
          id: "reference-full-name",
          name: "referenceFullName",
          label: "Full Name",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "reference-phone",
          name: "referencePhone",
          label: "Phone Number",
          inputType: "tel",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "reference-relationship",
          name: "referenceRelationship",
          label: "Relationship",
          required: true,
          width: "md:col-span-2",
        }),
      ],
    },
    {
      id: "parents",
      title: "Parents/Guardians",
      icon: "parents" as const,
      elements: [
        createText({
          id: "parent-1-title",
          name: "parent1Title",
          variant: "H3",
          content: "Parent 1",
        }),
        createInput({
          id: "parent1-first-name",
          name: "parent1FirstName",
          label: "First Name",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "parent1-last-name",
          name: "parent1LastName",
          label: "Last Name",
          required: true,
          width: "md:col-span-2",
        }),
        createSelect({
          id: "parent1-relationship",
          name: "parent1Relationship",
          label: "Relationship",
          required: true,
          width: "md:col-span-2",
          options: [
            createOption("parent-relationship-father", "Father", "father"),
            createOption("parent-relationship-mother", "Mother", "mother"),
          ],
        }),
        createInput({
          id: "parent1-email",
          name: "parent1Email",
          label: "Email",
          inputType: "email",
          required: true,
          width: "md:col-span-2",
        }),
        createInput({
          id: "parent1-telephone",
          name: "parent1Telephone",
          label: "Phone Number",
          inputType: "tel",
          required: true,
          width: "md:col-span-2",
        }),
        createText({
          id: "parent-2-title",
          name: "parent2Title",
          variant: "H3",
          content: "Parent 2",
        }),
        createInput({
          id: "parent2-first-name",
          name: "parent2FirstName",
          label: "First Name",
          width: "md:col-span-2",
        }),
        createInput({
          id: "parent2-last-name",
          name: "parent2LastName",
          label: "Last Name",
          width: "md:col-span-2",
        }),
        createSelect({
          id: "parent2-relationship",
          name: "parent2Relationship",
          label: "Relationship",
          width: "md:col-span-2",
          options: [
            createOption("parent2-relationship-father", "Father", "father"),
            createOption("parent2-relationship-mother", "Mother", "mother"),
          ],
        }),
        createInput({
          id: "parent2-email",
          name: "parent2Email",
          label: "Email",
          inputType: "email",
          width: "md:col-span-2",
        }),
        createInput({
          id: "parent2-telephone",
          name: "parent2Telephone",
          label: "Phone Number",
          inputType: "tel",
          width: "md:col-span-2",
        }),
      ],
    },
    {
      id: "general",
      title: "Additional Information",
      icon: "general" as const,
      elements: [
        createSelect({
          id: "person-submitting",
          name: "personSubmitting",
          label: "Person Submitting",
          required: true,
          options: [
            createOption("person-self", "Self", "self"),
            createOption("person-parent", "Parent", "parent"),
            createOption(
              "person-guidance",
              "Guidance Counselor",
              "guidance",
            ),
            createOption(
              "person-administration",
              "School Administration",
              "administration",
            ),
            createOption("person-coach", "Coach", "coach"),
          ],
        }),
        createSelect({
          id: "how-did-you-hear",
          name: "howDidYouHear",
          label: "How did you hear about us?",
          required: true,
          options: [
            createOption("hear-social-media", "Social Media", "socialMedia"),
            createOption("hear-friend", "Friend", "friend"),
            createOption("hear-coach", "Coach", "coach"),
            createOption("hear-teacher", "Teacher", "teacher"),
            createOption("hear-other", "Other", "other"),
          ],
        }),
        createSelect({
          id: "interested-in-boarding",
          name: "interestedInBoarding",
          label: "Are you interested in out boarding/housing services?",
          required: true,
          options: [
            createOption("boarding-yes", "Yes", "yes"),
            createOption("boarding-no", "No", "no"),
          ],
        }),
        createTextarea({
          id: "message",
          name: "message",
          label: "Message",
          placeholder: "Type your message...",
        }),
      ],
    },
  ],
};

export const legacyPreadmissionSerializedFormDefinition = JSON.stringify(
  legacyPreadmissionFormDefinition,
);

export function isLegacyImportedTemplate(template: {
  name: string;
  description?: string;
}) {
  return (
    template.name === LEGACY_IMPORTED_TEMPLATE_NAME &&
    template.description === LEGACY_IMPORTED_TEMPLATE_DESCRIPTION
  );
}

export function isLegacyImportedTemplateMissingDefinition(template: {
  name: string;
  description?: string;
  formDefinition?: string;
  sections: Array<{ fields: unknown[] }>;
}) {
  return (
    isLegacyImportedTemplate(template) &&
    !template.formDefinition &&
    template.sections.every((section) => section.fields.length === 0)
  );
}
