"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, Fragment, memo, useCallback } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

interface BreadcrumbSegment {
    title: string
    href?: string
    isCurrentPage?: boolean
}

interface RouteConfig {
    title: string
    parent?: string
    translationKey?: string
    fallback?: string
}

// Flexible route configuration - easily extensible
const ROUTE_CONFIG: Record<string, RouteConfig> = {
    'dashboard': { title: 'dashboard' },
    'academic': { title: 'menu.student.title', fallback: 'Academic' },
    'history': { title: 'menu.student.items.0.title', fallback: 'Academic History', parent: 'academic' },
    'progress': { title: 'menu.student.items.1.title', fallback: 'Academic Progress', parent: 'academic' },
    'docs': { title: 'studentDocs', fallback: 'Documentation' },
    'transcripts': { title: 'menu.studentDocs.items.0.title', fallback: 'Certificates & Transcripts', parent: 'docs' },
    'teaching': { title: 'menu.professor.title', fallback: 'Teaching' },
    'gradebook': { title: 'menu.professor.items.0.title', fallback: 'Gradebook', parent: 'teaching' },
    'admin': { title: 'academicAdmin', fallback: 'Administration' },
    'programs': { title: 'menu.adminAcademic.items.0.title', fallback: 'Program Management', parent: 'admin' },
    'courses': { title: 'menu.adminAcademic.items.1.title', fallback: 'Course Management', parent: 'admin' },
    'periods': { title: 'menu.adminAcademic.items.2.title', fallback: 'Period Management', parent: 'admin' },
    'users': { title: 'personalAdmin', fallback: 'User Management' },
    'professors': { title: 'menu.adminPersonal.items.0.title', fallback: 'Professor Management', parent: 'users' },
    'students': { title: 'menu.adminPersonal.items.1.title', fallback: 'Student Management', parent: 'users' },
    'profile': { title: 'profile', fallback: 'Profile' },
}

// Routes that don't need translation (static labels)
const STATIC_ROUTES: Record<string, string> = {
    'teachers': 'Teachers',
    'curriculums': 'Curriculums',
    'lessons': 'Lessons',
    'classes': 'Classes',
}

// Helper to detect if a segment is a Convex ID
const isConvexId = (segment: string): boolean => {
    // Convex IDs are typically long alphanumeric strings (32+ chars)
    return segment.length > 20 && /^[a-z0-9]+$/.test(segment)
}

export const DynamicBreadcrumb = memo(function DynamicBreadcrumb() {
    const pathname = usePathname()
    const t = useTranslations('navigation')

    // Memoize path processing
    const pathWithoutLocale = useMemo(() => {
        return pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '')
    }, [pathname])

    // Extract dynamic IDs from path
    const { curriculumId, lessonId, classId, teacherId } = useMemo(() => {
        const parts = pathWithoutLocale.split('/').filter(Boolean)
        const curriculumIndex = parts.indexOf('curriculums')
        const lessonIndex = parts.indexOf('lessons')
        const classIndex = parts.indexOf('classes')
        const teacherIndex = parts.indexOf('teachers')

        return {
            curriculumId: curriculumIndex !== -1 && parts[curriculumIndex + 1] && isConvexId(parts[curriculumIndex + 1])
                ? parts[curriculumIndex + 1] as Id<"curriculums">
                : null,
            lessonId: lessonIndex !== -1 && parts[lessonIndex + 1] && isConvexId(parts[lessonIndex + 1])
                ? parts[lessonIndex + 1] as Id<"lessons">
                : null,
            classId: classIndex !== -1 && parts[classIndex + 1] && isConvexId(parts[classIndex + 1])
                ? parts[classIndex + 1] as Id<"classes">
                : null,
            teacherId: teacherIndex !== -1 && parts[teacherIndex + 1] && isConvexId(parts[teacherIndex + 1])
                ? parts[teacherIndex + 1] as Id<"users">
                : null,
        }
    }, [pathWithoutLocale])

    // Fetch dynamic data
    const curriculum = useQuery(
        api.curriculums.get,
        curriculumId ? { id: curriculumId } : "skip"
    )
    const lesson = useQuery(
        api.lessons.get,
        lessonId ? { id: lessonId } : "skip"
    )
    const classData = useQuery(
        api.classes.get,
        classId ? { id: classId } : "skip"
    )
    const teacher = useQuery(
        api.users.getUser,
        teacherId ? { userId: teacherId } : "skip"
    )

    // Stable translation function with useCallback
    const getTranslation = useCallback((key: string, fallback: string) => {
        try {
            // Handle nested keys like "menu.student.title"
            if (key.includes('.')) {
                const result = t.raw(key as never)
                return result || fallback
            }
            return t(key as never) || fallback
        } catch {
            return fallback
        }
    }, [t])

    const breadcrumbSegments = useMemo((): BreadcrumbSegment[] => {
        const segments: BreadcrumbSegment[] = []

        // Handle root/dashboard
        if (!pathWithoutLocale || pathWithoutLocale === '/') {
            segments.push({
                title: getTranslation('dashboard', 'Dashboard'),
                isCurrentPage: true
            })
            return segments
        }

        // Split path and create segments
        const pathParts = pathWithoutLocale.split('/').filter(Boolean)

        // Filter out 'admin' segment from breadcrumb (Academic Administration)
        const filteredParts = pathParts.filter(part => part !== 'admin')

        // Build breadcrumb path
        let currentPath = ''
        filteredParts.forEach((part, index) => {
            // Reconstruct the actual path including admin for navigation
            const actualPathParts = pathParts.slice(0, pathParts.indexOf(part) + 1)
            currentPath = '/' + actualPathParts.join('/')
            const isLast = index === filteredParts.length - 1

            // Check if this is a dynamic ID
            let title: string
            if (isConvexId(part)) {
                // Get dynamic name based on context
                if (curriculumId && part === curriculumId) {
                    title = curriculum?.title || 'Loading...'
                } else if (lessonId && part === lessonId) {
                    title = lesson?.title || 'Loading...'
                } else if (classId && part === classId) {
                    title = classData?.name || 'Loading...'
                } else if (teacherId && part === teacherId) {
                    title = teacher?.fullName || 'Loading...'
                } else {
                    title = part
                }
            } else {
                // Check static routes first (no translation needed)
                if (STATIC_ROUTES[part]) {
                    title = STATIC_ROUTES[part]
                } else {
                    // Then check translated routes
                    const config = ROUTE_CONFIG[part]
                    title = config
                        ? getTranslation(config.title, config.fallback || config.title)
                        : part.charAt(0).toUpperCase() + part.slice(1)
                }
            }

            segments.push({
                title,
                href: isLast ? undefined : currentPath,
                isCurrentPage: isLast
            })
        })

        return segments
    }, [
        pathWithoutLocale,
        getTranslation,
        curriculumId,
        curriculum,
        lessonId,
        lesson,
        classId,
        classData,
        teacherId,
        teacher,
    ])

    return (
        <Breadcrumb>
            <BreadcrumbList>
                {breadcrumbSegments.map((segment, index) => (
                    <Fragment key={index}>
                        {index > 0 && <BreadcrumbSeparator />}
                        <BreadcrumbItem>
                            {segment.isCurrentPage ? (
                                <BreadcrumbPage>{segment.title}</BreadcrumbPage>
                            ) : (
                                <BreadcrumbLink href={segment.href || "#"}>
                                    {segment.title}
                                </BreadcrumbLink>
                            )}
                        </BreadcrumbItem>
                    </Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    )
})
