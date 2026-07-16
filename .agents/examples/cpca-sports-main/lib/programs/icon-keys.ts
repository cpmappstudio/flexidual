export const DEFAULT_PROGRAM_ICON_KEY = "generic";

export const PROGRAM_ICON_KEYS = [
  DEFAULT_PROGRAM_ICON_KEY,
  "baseball",
  "basketball",
  "soccer",
  "volleyball",
  "hr14_baseball",
  "golf",
  "tennis",
  "softball",
  "volleyball-club",
  "pg-basketball",
  "football",
  "swimming",
  "track",
] as const;

export type ProgramIconKey = (typeof PROGRAM_ICON_KEYS)[number];

export function isProgramIconKey(
  value: string | null | undefined,
): value is ProgramIconKey {
  return PROGRAM_ICON_KEYS.includes(value as ProgramIconKey);
}
