export const CURRICULUM_ICON_KEYS = [
  "abacus",
  "alarm",
  "apple",
  "art-and-design",
  "atomic-structure",
  "basketball",
  "blackboard",
  "books",
  "certification",
  "clip",
  "compass",
  "cross",
  "day-and-night",
  "dna",
  "eye-glasses",
  "globe",
  "heart",
  "holy-bible",
  "holy-spirit",
  "identification",
  "laptop",
  "light-bulb",
  "magnet",
  "magnifying-glass",
  "math",
  "medal",
  "microscope",
  "molecule",
  "moon",
  "music-sheet",
  "music",
  "octagonal",
  "paper-airplane",
  "pencil",
  "planet-earth",
  "push-pin",
  "ruler",
  "satellite",
  "school-bag",
  "school-bell",
  "scissors",
  "sharpener",
  "spell-book",
  "star-of-david",
  "statue-of-liberty",
  "sun",
  "telescope",
  "test-tube",
  "washington-monument",
  "wave-graph",
] as const;

export type CurriculumIconKey = (typeof CURRICULUM_ICON_KEYS)[number];

export const DEFAULT_CURRICULUM_ICON: CurriculumIconKey = "books";

export function isCurriculumIconKey(
  value: string | undefined,
): value is CurriculumIconKey {
  return CURRICULUM_ICON_KEYS.some((key) => key === value);
}

export function getCurriculumIconKey(
  value: string | undefined,
): CurriculumIconKey {
  return isCurriculumIconKey(value) ? value : DEFAULT_CURRICULUM_ICON;
}

export function getCurriculumIconSrc(value: string | undefined) {
  return `/curriculum-icons/${getCurriculumIconKey(value)}.png`;
}

export function formatCurriculumIconName(key: CurriculumIconKey) {
  return key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
