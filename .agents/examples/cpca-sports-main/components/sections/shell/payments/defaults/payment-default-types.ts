export type PaymentDefaultFeeLike = {
  _id: string;
  _creationTime: number;
  feeKey: string;
  name: string;
  totalAmount: number;
  downPaymentPercent: number;
  isRefundable: boolean;
  isIncluded: boolean;
  isRequired: boolean;
  createdAt: number;
  recurringPlanId?: string;
  installmentIndex?: number;
  installmentCount?: number;
  dueDayOfMonth?: number;
  timezone?: string;
  isRecurring?: boolean;
};

export function isRecurringPaymentDefault(fee: PaymentDefaultFeeLike): boolean {
  return fee.isRecurring === true || fee.recurringPlanId !== undefined;
}
