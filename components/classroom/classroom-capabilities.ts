export type ClassroomExperience = "staff" | "student";

export interface ClassroomCapabilities {
  isTeacher: boolean;
  canManageSession: boolean;
  canManageRecording: boolean;
  canModerateRaisedHands: boolean;
  canManageScreenShareRequests: boolean;
  canUseCompanionMode: boolean;
  canRaiseOwnHand: boolean;
  canRequestScreenShare: boolean;
  canSwitchToNextClass: boolean;
}

const SESSION_AUTHORITY_ROLES = new Set([
  "teacher",
  "admin",
  "superadmin",
  "tutor",
  "principal",
]);

const STUDENT_TRUSTED_SIGNAL_ROLES = new Set(["teacher", "admin"]);

export function isClassroomSessionAuthority(role: string): boolean {
  return SESSION_AUTHORITY_ROLES.has(role);
}

export function canRoleSendStudentScreenShareDecision(role: string): boolean {
  return STUDENT_TRUSTED_SIGNAL_ROLES.has(role);
}

export function getClassroomCapabilities(
  experience: ClassroomExperience,
  role?: string,
): ClassroomCapabilities {
  const isStaffAuthority =
    experience === "staff" && !!role && isClassroomSessionAuthority(role);

  return {
    isTeacher: experience === "staff" && role === "teacher",
    canManageSession: isStaffAuthority,
    canManageRecording: isStaffAuthority,
    canModerateRaisedHands: isStaffAuthority,
    canManageScreenShareRequests: isStaffAuthority,
    canUseCompanionMode: isStaffAuthority,
    canRaiseOwnHand: experience === "student",
    canRequestScreenShare: experience === "student",
    canSwitchToNextClass: experience === "student",
  };
}
