export type ClassSessionType = "live" | "ignitia" | "abeka";

export function isExternalClassSession(
  sessionType: ClassSessionType | undefined,
) {
  return sessionType === "ignitia" || sessionType === "abeka";
}
