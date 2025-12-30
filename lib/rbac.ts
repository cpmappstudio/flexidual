import { auth } from "@clerk/nextjs/server";
import { createRouteMatcher } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import type { UserRole } from "@/convex/types";

// 1. DEFINITIONS: Centralize all route patterns here
const roleMatchers = {
    // Dashboards
    teacher: createRouteMatcher(['/:locale/teaching(.*)', '/teaching(.*)']),
    student: createRouteMatcher(['/:locale/student(.*)', '/student(.*)']), // Now properly used
    admin: createRouteMatcher(['/:locale/admin(.*)', '/admin(.*)']),
    
    // Core Features
    calendar: createRouteMatcher(['/:locale/calendar(.*)', '/calendar(.*)']),
    classroom: createRouteMatcher(['/:locale/classroom(.*)', '/classroom(.*)']),
    
    // Content
    lessons: createRouteMatcher(['/:locale/lessons(.*)', '/lessons(.*)']),
    // Note: Curriculums are edited by teachers/admins
    curriculums: createRouteMatcher(['/:locale/curriculums(.*)', '/curriculums(.*)']),
} as const;

// 2. PERMISSIONS: Who can access what?
const ROLE_PERMISSIONS: Record<keyof typeof roleMatchers, readonly UserRole[]> = {
    teacher: ['teacher', 'admin', 'superadmin'],
    student: ['student', 'admin', 'superadmin'],
    admin: ['admin', 'superadmin'],
    calendar: ['student', 'teacher', 'tutor', 'admin', 'superadmin'],
    classroom: ['student', 'teacher', 'tutor', 'admin', 'superadmin'], 
    lessons: ['student', 'teacher', 'tutor', 'admin', 'superadmin'],
    curriculums: ['teacher', 'admin', 'superadmin'],
};

/**
 * Extract user role from Clerk session claims
 */
export function roleFromSessionClaims(sessionClaims: unknown): UserRole | null {
    if (!sessionClaims) return null;

    const claims = sessionClaims as Record<string, unknown>;
    const publicMeta = claims?.publicMetadata as Record<string, unknown> | undefined;
    const privateMeta = claims?.privateMetadata as Record<string, unknown> | undefined;
    const metadata = claims?.metadata as Record<string, unknown> | undefined;

    const role = publicMeta?.role ?? privateMeta?.role ?? metadata?.role;

    return (role as UserRole) ?? null;
}

/**
 * Get current user role from Clerk session claims
 */
export async function getCurrentUserRole(): Promise<UserRole | null> {
    try {
        const { sessionClaims } = await auth();
        return roleFromSessionClaims(sessionClaims);
    } catch (error) {
        console.error('Error getting user role:', error);
        return null;
    }
}

/**
 * Check if user has any of the required roles
 */
export function hasRole(userRole: UserRole | null, requiredRoles: UserRole[]): boolean {
    return userRole ? requiredRoles.includes(userRole) : false;
}

/**
 * Check if user can access admin features
 */
export function canAccessAdmin(userRole: UserRole | null): boolean {
    return hasRole(userRole, ['admin', 'superadmin']);
}

/**
 * Check if user can access teaching features
 */
export function canAccessTeaching(userRole: UserRole | null): boolean {
    return hasRole(userRole, ['teacher', 'admin', 'superadmin']);
}

/**
 * Check if user is a teacher
 */
export function isTeacher(userRole: UserRole | null): boolean {
    return userRole === 'teacher';
}

/** 
 * Check if user is a student
 */
export function isStudent(userRole: UserRole | null): boolean {
    return userRole === 'student';
}

/** 
 * Check if user is a tutor
 */
export function isTutor(userRole: UserRole | null): boolean {
    return userRole === 'tutor';
}

/**
 * Check role access in middleware context
 * @returns 'allowed' | 'denied' | 'unknown'
 */
export function checkRoleAccess(
    req: NextRequest,
    userRole: UserRole
): 'allowed' | 'denied' | 'unknown' {
    // Check each role matcher
    for (const [route, matcher] of Object.entries(roleMatchers)) {
        if (matcher(req)) {
            const allowed = ROLE_PERMISSIONS[route as keyof typeof roleMatchers];
            return allowed.includes(userRole) ? 'allowed' : 'denied';
        }
    }

    // If no matcher matches, it's an unknown route (allow by default, e.g., home, about)
    return 'unknown';
}