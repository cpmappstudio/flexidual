// ################################################################################
// # File: types.ts                                                               #
// # Project: CPCA Teachers - Teacher Progress Tracking System                    #
// # Description: Shared types and validators for teacher progress tracking       #
// # Creation date: 09/22/2025                                                    #
// ################################################################################

/**
 * User role type for the application
 */
export type UserRole = "teacher" | "admin" | "superadmin" | "student" | "tutor";

/**
 * User status type
 */
export type UserStatus = "active" | "inactive" | "on_leave" | "terminated";

/**
 * Campus status type
 */
export type CampusStatus = "active" | "inactive" | "maintenance";

/**
 * Curriculum status type
 */
export type CurriculumStatus = "draft" | "active" | "archived" | "deprecated";

/**
 * Student attendance status type
 */
export type StudentAttendanceStatus = "online" | "offline" | "in_class" | "away";