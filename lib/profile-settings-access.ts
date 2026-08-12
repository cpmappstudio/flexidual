export type ProfileSettingsAccess =
  | "full"
  | "profile-without-email"
  | "security-only"
  | "password-only";

export function getProfileSettingsAccess(
  role: string | null,
  isSystemSuperAdmin: boolean,
): ProfileSettingsAccess {
  if (isSystemSuperAdmin || role === "admin" || role === "superadmin") {
    return "full";
  }

  if (role === "teacher" || role === "tutor") {
    return "profile-without-email";
  }

  if (role === "principal") {
    return "security-only";
  }

  return "password-only";
}
