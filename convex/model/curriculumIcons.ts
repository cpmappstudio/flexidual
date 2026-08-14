import { v } from "convex/values";
import { CURRICULUM_ICON_KEYS } from "../../lib/curriculum-icons";

export const curriculumIconValidator = v.union(
  ...CURRICULUM_ICON_KEYS.map((key) => v.literal(key)),
);
