import { Id } from "@/convex/_generated/dataModel";

export type PaymentMethod = "online" | "cash" | "wire";

export type TransactionStatus = "pending" | "completed" | "failed";

export type Transaction = {
  _id: Id<"transactions">;
  _creationTime: number;
  applicationId: Id<"applications">;
  feeId: Id<"fees">;
  amount: number; // In cents
  method: PaymentMethod;
  status: TransactionStatus;
  squarePaymentId?: string;
  squareOrderId?: string;
  receiptUrl?: string;
  reference?: string;
  registeredBy?: Id<"users">;
  createdAt: number;
  completedAt?: number;
};

export type RegisteredByUser = {
  _id: Id<"users">;
  firstName: string;
  lastName: string;
  email: string;
};

export type TransactionWithFee = {
  transaction: Transaction;
  feeName: string;
  feeDescription?: string;
  registeredByUser?: RegisteredByUser;
};

export type FeeSummary = {
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  feeCount: number;
  paidCount: number;
};
