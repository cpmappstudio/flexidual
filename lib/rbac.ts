import { auth } from "@clerk/nextjs/server";
import { createRouteMatcher } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import type { UserRole } from "@/convex/types";

// 1. DEFINITIONS: Centralize all route patterns here
const roleMatchers = {
    // Dashboards (Separate route groups)
    teacher: createRouteMatcher(['/:locale/teaching(.*)', '/teaching(.*)']),
    student: createRouteMatcher(['/:locale/student(.*)', '/student(.*)']), // Student SPA
    admin: createRouteMatcher(['/:locale/admin(.*)', '/admin(.*)']),
    
    // Core Features (Shared between roles)
    calendar: createRouteMatcher(['/:locale/calendar(.*)', '/calendar(.*)']),
    classroom: createRouteMatcher(['/:locale/classroom(.*)', '/classroom(.*)']),
    docs: createRouteMatcher(['/:locale/docs(.*)', '/docs(.*)']),
    
    // Content (Role-specific access)
    lessons: createRouteMatcher(['/:locale/lessons(.*)', '/lessons(.*)']),
    curriculums: createRouteMatcher(['/:locale/curriculums(.*)', '/curriculums(.*)']),
} as const;

// 2. PERMISSIONS: Who can access what?
const ROLE_PERMISSIONS: Record<keyof typeof roleMatchers, readonly UserRole[]> = {
    // Dashboards - Exclusive access
    teacher: ['teacher', 'tutor', 'admin', 'superadmin'], // Teachers, tutors, and admins
    student: ['student', 'admin', 'superadmin'], // Students and admins (for testing/support)
    admin: ['admin', 'superadmin'], // Only admins
    
    // Shared Features - Open to relevant roles
    calendar: ['student', 'teacher', 'tutor', 'admin', 'superadmin'], // Everyone (deprecated for students - they use SPA)
    classroom: ['student', 'teacher', 'tutor', 'admin', 'superadmin'], // Everyone can join
    docs: ['student', 'teacher', 'tutor', 'admin', 'superadmin'], // Documentation for all
    
    // Content - Restricted
    lessons: ['student', 'teacher', 'tutor', 'admin', 'superadmin'], // View access
    curriculums: ['teacher', 'admin', 'superadmin'], // Edit access only
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
    return hasRole(userRole, ['teacher', 'tutor', 'admin', 'superadmin']);
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
 * Get default dashboard path for role
 */
export function getDefaultDashboard(userRole: UserRole, locale: string = 'en'): string {
    switch (userRole) {
        case 'student':
            return `/${locale}/student`; // Student SPA
        case 'teacher':
        case 'tutor':
            return `/${locale}/teaching`; // Teacher dashboard
        case 'admin':
        case 'superadmin':
            return `/${locale}/admin`; // Admin dashboard
        default:
            return `/${locale}/student`; // Fallback
    }
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

    // If no matcher matches, it's an unknown route (allow by default)
    return 'unknown';
}