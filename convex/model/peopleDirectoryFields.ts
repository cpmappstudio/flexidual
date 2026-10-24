import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export const peopleDirectoryValidator = v.object({
  name: v.string(),
  email: v.string(),
  search: v.string(),
  isActive: v.boolean(),
  grade: v.string(),
});

/** Only indexable fields; profiles and permissions remain in their source tables. */
export function peopleDirectoryFields(user: Doc<"users">, gradeCode?: string) {
  return {
    name: user.fullName.toLowerCase(),
    email: (user.email ?? "").toLowerCase(),
    search: `${user.fullName} ${user.email ?? ""}`,
    isActive: user.isActive,
    grade: gradeCode ?? user.grade ?? "",
  };
}
