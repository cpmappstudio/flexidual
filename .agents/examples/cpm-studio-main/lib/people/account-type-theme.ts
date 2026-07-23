export type TenantAccountType = "guardian" | "none" | "self";

export const TENANT_ACCOUNT_TYPE_TONE_CLASS_NAMES: Record<
  TenantAccountType,
  string
> = {
  guardian:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  none: "text-muted-foreground",
  self: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

export const TENANT_ACCOUNT_TYPE_SOLID_TONE_CLASS_NAMES: Record<
  TenantAccountType,
  string
> = {
  guardian:
    "border-amber-500 bg-amber-500 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950",
  none: "border-muted bg-muted text-muted-foreground",
  self: "border-sky-500 bg-sky-500 text-white dark:border-sky-400 dark:bg-sky-400 dark:text-sky-950",
};
