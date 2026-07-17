import type { Id } from "@/convex/_generated/dataModel";

export type ApplicationStatus =
  | "pending"
  | "reviewing"
  | "pre-admitted"
  | "admitted"
  | "denied";

export type FormData = Record<
  string,
  Record<string, string | number | boolean | null | Id<"_storage">>
>;

export interface ApplicationApplicant {
  photoStorageId?: Id<"_storage">;
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
}

export interface ApplicationProgramSnapshot {
  name: string;
  iconKey?: string;
}

export interface Application {
  _id: Id<"applications">;
  _creationTime: number;
  userId: Id<"users">;
  organizationId: Id<"organizations">;
  programId?: Id<"programs">;
  formTemplateId?: Id<"formTemplates">;
  formTemplateVersion?: number;
  applicationCode: string;
  status: ApplicationStatus;
  isArchived?: boolean;
  applicant?: ApplicationApplicant;
  programSnapshot?: ApplicationProgramSnapshot;
  formDefinitionSnapshot?: string;
  formData: FormData;
  reviewedBy?: Id<"users">;
  reviewedAt?: number;
}

/**
 * Helper to get a field value from formData.
 * formData structure: { sectionKey: { fieldKey: value } }
 */
export function getFormField(
  formData: FormData,
  sectionKey: string,
  fieldKey: string,
): string {
  const value = formData[sectionKey]?.[fieldKey];
  return value != null ? String(value) : "";
}
