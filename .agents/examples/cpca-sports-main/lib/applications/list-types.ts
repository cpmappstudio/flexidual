import type { Id } from "@/convex/_generated/dataModel";
import type { ApplicationStatus } from "@/lib/applications/types";

export interface ApplicationListItem {
  _id: Id<"applications">;
  _creationTime: number;
  organizationId: Id<"organizations">;
  programId?: Id<"programs">;
  programIconKey?: string;
  applicationCode: string;
  status: ApplicationStatus;
  isArchived: boolean;
  enrollmentYear?: string;
  sex?: "male" | "female" | "other";
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    telephone: string;
    photoStorageId?: Id<"_storage">;
    photoUrl?: string;
  };
  program: {
    name: string;
  };
  account: {
    firstName: string;
    lastName: string;
    email: string;
    imageUrl?: string;
  };
  paymentSummary: {
    totalDue: number;
    totalPaid: number;
    totalPending: number;
    feeCount: number;
    paidCount: number;
  };
}
