// A single explicit origin, never a wildcard, path, or credential-bearing URL.
export function surveyOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" && url.origin !== "http://localhost:3000")
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
