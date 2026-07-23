import type { Id } from "@/convex/_generated/dataModel";

export type AcademicProfileCampusId = Id<"campuses"> | "";

export type AcademicProfileDraft = {
  id: string;
  firstName: string;
  lastName: string;
  campusId: AcademicProfileCampusId;
};

export type NormalizedAcademicProfileDraft = {
  firstName: string;
  lastName: string;
  campusId?: Id<"campuses">;
};

export function createAcademicProfileDraft(id: string): AcademicProfileDraft {
  return {
    id,
    firstName: "",
    lastName: "",
    campusId: "",
  };
}

export function normalizeAcademicProfileDraft(
  profile: AcademicProfileDraft,
): NormalizedAcademicProfileDraft {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    ...(profile.campusId ? { campusId: profile.campusId } : {}),
  };
}
