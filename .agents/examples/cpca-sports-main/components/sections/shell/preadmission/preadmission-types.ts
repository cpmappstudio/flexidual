import type { Id } from "@/convex/_generated/dataModel";

export interface AvailableProgramForApplication {
  _id: Id<"programs">;
  organizationId: Id<"organizations">;
  name: string;
  description?: string;
  iconKey?: string;
  formDefinition: string;
  updatedAt: number;
}

export interface PreadmissionApplicantCore {
  photoStorageId: Id<"_storage"> | null;
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
}
