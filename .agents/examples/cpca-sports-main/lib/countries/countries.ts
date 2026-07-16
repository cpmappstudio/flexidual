import countries from "world-countries";

export interface Country {
  value: string;
  label: string;
  flag: string;
}

export const COUNTRIES: Country[] = countries
  .map((country) => ({
    value: country.cca2,
    label: country.name.common,
    flag: country.flag,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function getCountryName(code: string): string {
  if (!code) return "";
  const country = COUNTRIES.find((c) => c.value === code);
  return country?.label || code;
}
