import { Id } from "@/convex/_generated/dataModel";

export type DocumentType = {
  id: string;
  name: string;
  description?: string;
  required: boolean;
};

export type DocumentStatus = "pending" | "approved" | "rejected";

export type DocumentVisibility = "required" | "optional" | "hidden";

export type DocumentConfig = {
  _id: Id<"applicationDocumentConfig">;
  _creationTime: number;
  applicationId: Id<"applications">;
  documentTypeId: string;
  visibility: DocumentVisibility;
  updatedAt: number;
  updatedBy: Id<"users">;
  isCustom?: boolean;
  name?: string;
  description?: string;
};

export type ApplicationDocument = {
  _id: Id<"applicationDocuments">;
  _creationTime: number;
  applicationId: Id<"applications">;
  documentTypeId: string;
  name: string;
  description?: string;
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  fileSize: number;
  status: DocumentStatus;
  uploadedBy: Id<"users">;
  uploadedAt: number;
  reviewedBy?: Id<"users">;
  reviewedAt?: number;
  rejectionReason?: string;
  url?: string | null;
};

export type UploadedByUser = {
  _id: Id<"users">;
  firstName: string;
  lastName: string;
  email: string;
};

export type ApplicationDocumentWithUser = ApplicationDocument & {
  uploadedByUser?: UploadedByUser;
};

export const APPLICATION_DOCUMENTS: DocumentType[] = [
  {
    id: "arrival_departure_dates",
    name: "Arrival and Departure Dates Coordination",
    description: "English",
    required: true,
  },
  {
    id: "athletic_permission_parent",
    name: "Athletic Participation Permission Form",
    description: "Fill-Up by Parent",
    required: true,
  },
  {
    id: "athletic_permission_physician",
    name: "Athletic Participation Permission Form",
    description: "Fill-Up by Physician",
    required: true,
  },
  {
    id: "birth_certificate",
    name: "Birth Certificate",
    required: true,
  },
  {
    id: "medical_insurance",
    name: "Copy of Medical Insurance",
    description: "Must be valid in USA",
    required: true,
  },
  {
    id: "social_security",
    name: "Copy of Social Security Number",
    required: true,
  },
  {
    id: "visa",
    name: "Copy of Visa",
    required: true,
  },
  {
    id: "father_id",
    name: "Father ID or Passport",
    required: true,
  },
  {
    id: "federal_scholarship",
    name: "Federal Scholarship Evidence",
    required: false,
  },
  {
    id: "scholarship_award",
    name: "Scholarship Award Letter",
    required: false,
  },
  {
    id: "housing_rules",
    name: "Housing Rules",
    required: true,
  },
  {
    id: "i20_letter",
    name: "I-20 and Letter",
    required: true,
  },
  {
    id: "i20_form",
    name: "I-20 Form",
    required: true,
  },
  {
    id: "immunization_record",
    name: "Immunization Record (DH 680)",
    description: "All Vaccination Records",
    required: true,
  },
  {
    id: "legal_guardian_id",
    name: "Legal Guardian ID",
    required: false,
  },
  {
    id: "mother_id",
    name: "Mother ID or Passport",
    required: true,
  },
  {
    id: "official_transcript",
    name: "Official Transcript",
    required: true,
  },
  {
    id: "passport",
    name: "Passport (I-20 Students)",
    required: true,
  },
  {
    id: "student_id",
    name: "Student's ID or Green Card",
    description: "Proof of Citizenship / Residency",
    required: true,
  },
];
