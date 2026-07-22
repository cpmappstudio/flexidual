export const DEFAULT_INSTITUTION_GRADES = [
  { code: "K", name: "Kindergarten" },
  ...Array.from({ length: 12 }, (_, index) => ({
    code: String(index + 1).padStart(2, "0"),
    name: `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} Grade`,
  })),
] as const;

export function createGradeCode(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}
