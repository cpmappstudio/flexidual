export const GRADES = [
  { value: "K", label: "Kindergarten" },
  { value: "01", label: "1st Grade" },
  { value: "02", label: "2nd Grade" },
  { value: "03", label: "3rd Grade" },
  { value: "04", label: "4th Grade" },
  { value: "05", label: "5th Grade" },
  { value: "06", label: "6th Grade" },
  { value: "07", label: "7th Grade" },
  { value: "08", label: "8th Grade" },
  { value: "09", label: "9th Grade" },
  { value: "10", label: "10th Grade" },
  { value: "11", label: "11th Grade" },
  { value: "12", label: "12th Grade" },
] as const;

export type GradeValue = typeof GRADES[number]["value"];

export const GRADE_VALUES = GRADES.map(g => g.value);