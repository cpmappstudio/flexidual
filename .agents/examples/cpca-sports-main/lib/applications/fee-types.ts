import { Id } from "@/convex/_generated/dataModel";

export type FeeStatus = "pending" | "partially_paid" | "paid";

export type Fee = {
  _id: Id<"fees">;
  _creationTime: number;
  applicationId: Id<"applications">;
  name: string;
  description?: string;
  totalAmount: number; // In cents
  downPaymentPercent: number; // 0-100
  isRefundable: boolean;
  isIncluded: boolean;
  isDefault: boolean;
  isRequired: boolean;
  status: FeeStatus;
  paidAmount: number; // In cents
  createdAt: number;
  paidAt?: number;
  createdBy: Id<"users">;
  recurringPlanId?: Id<"recurringFeePlans">;
  installmentIndex?: number;
  installmentCount?: number;
  dueDate?: string; // YYYY-MM-DD
  timezone?: string; // IANA timezone
  isRecurring?: boolean;
};

// Default fees configuration (amounts in cents)
export const DEFAULT_APPLICATION_FEES = [
  {
    name: "I-20 Application Fee",
    description: "Application processing fee for I-20 students",
    totalAmount: 20000, // $200.00
    downPaymentPercent: 50,
    isRefundable: true,
    isIncluded: true,
    isRequired: true,
  },
  {
    name: "I-20 Tuition Fee",
    description: "Tuition fee for I-20 students",
    totalAmount: 1000000, // $10,000.00
    downPaymentPercent: 30,
    isRefundable: true,
    isIncluded: true,
    isRequired: true,
  },
  {
    name: "Sports Uniform Fee",
    description: "Sports uniform and equipment",
    totalAmount: 30000, // $300.00
    downPaymentPercent: 100,
    isRefundable: true,
    isIncluded: true,
    isRequired: true,
  },
] as const;
