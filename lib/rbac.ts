import { auth } from "@clerk/nextjs/server";
import { createRouteMatcher } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import type { UserRole } from "@/convex/types";

// Rutas específicas por rol
const roleMatchers = {
    teacher: createRouteMatcher(['/:locale/teaching(.*)', '/teaching(.*)']),
    admin: createRouteMatcher(['/:locale/admin(.*)', '/admin(.*)']),
    shared: createRouteMatcher([
        '/:locale/lessons(.*)',
        '/lessons(.*)',
        '/:locale/curriculums(.*)',
        '/curriculums(.*)'
    ]),
} as const;

// Constantes inmutables con type safety completo
const ROLE_PERMISSIONS: Record<keyof typeof roleMatchers, readonly UserRole[]> = {
    teacher: ['teacher', 'admin', 'superadmin'],
    admin: ['admin', 'superadmin'],
    shared: ['teacher', 'admin', 'superadmin', 'student', 'tutor'],
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
 * Verifica acceso por rol en el contexto del middleware
 * @returns 'allowed' | 'denied' | 'unknown'
 */
export function checkRoleAccess(
    req: NextRequest,
    userRole: UserRole
): 'allowed' | 'denied' | 'unknown' {
    // Verificar cada matcher de rol
    for (const [route, matcher] of Object.entries(roleMatchers)) {
        if (matcher(req)) {
            const allowed = ROLE_PERMISSIONS[route as keyof typeof roleMatchers] as readonly UserRole[];
            return allowed.includes(userRole) ? 'allowed' : 'denied';
        }
    }

    // Si no coincide con ningún matcher, es ruta desconocida
    return 'unknown';
}
