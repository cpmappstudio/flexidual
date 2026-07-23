export type RequestedLocaleParams = Promise<{ locale: string }>;
export type LocaleParams = RequestedLocaleParams;
export type TenantParams = Promise<{ locale: string; tenant: string }>;
export type TenantCampusParams = Promise<{
  locale: string;
  tenant: string;
  campus: string;
}>;
