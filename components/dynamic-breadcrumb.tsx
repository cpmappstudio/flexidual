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

// Translation key type
type TranslationKey = 'dashboard' | 'calendar' | 'teaching' | 'administration' | 
                      'curriculums' | 'lessons' | 'classes' | 'teachers' | 'students' | 'users' |
                      'classroom' | 'unknown' | 'title';

// Updated route configuration matching your actual translation keys
const ROUTE_CONFIG: Record<string, { key: TranslationKey; namespace?: string }> = {
    // Main navigation
    'dashboard': { key: 'dashboard', namespace: 'navigation' },
    'calendar': { key: 'calendar', namespace: 'navigation' },
    'teaching': { key: 'teaching', namespace: 'navigation' },
    'admin': { key: 'administration', namespace: 'navigation' },
    
    // Teaching section
    'curriculums': { key: 'curriculums', namespace: 'navigation' },
    'lessons': { key: 'lessons', namespace: 'navigation' },
    'classes': { key: 'classes', namespace: 'navigation' },
    
    // Admin section
    'teachers': { key: 'teachers', namespace: 'navigation' },
    'students': { key: 'students', namespace: 'navigation' },
    
    // Student section
    'student': { key: 'dashboard', namespace: 'navigation' },
    
    // Classroom
    'classroom': { key: 'classroom', namespace: 'classroom' },

    // Users
    'users': { key: 'users', namespace: 'navigation' },
}

// Helper to detect if a segment is a Convex ID
const isConvexId = (segment: string): boolean => {
    return segment.length > 20 && /^[a-z0-9]+$/.test(segment)
}

// Helper to detect if a segment is a room name
const isRoomName = (segment: string): boolean => {
    return segment.startsWith('class-') && (segment.includes('-lesson-') || segment.includes('-series-'))
}

// Extract IDs from room name (handles both lesson and series)
const parseRoomName = (roomName: string): { classId: string; lessonId?: string; seriesId?: string } | null => {
    // Try lesson pattern first
    let match = roomName.match(/class-([a-z0-9]+)-lesson-([a-z0-9]+)/)
    if (match) {
        return {
            classId: match[1],
            lessonId: match[2],
        }
    }
    
    // Try series pattern (for recurring schedules without lessons)
    match = roomName.match(/class-([a-z0-9]+)-series-(\d+)/)
    if (match) {
        return {
            classId: match[1],
            seriesId: match[2],
        }
    }
    
    return null
}

export const DynamicBreadcrumb = memo(function DynamicBreadcrumb() {
    const pathname = usePathname()
    const tNav = useTranslations('navigation')
    const tClass = useTranslations('classroom')
    const tCurr = useTranslations('curriculum')
    const tLesson = useTranslations('lesson')

    // Memoize path processing
    const pathWithoutLocale = useMemo(() => {
        return pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/, '')
    }, [pathname])

    // Extract dynamic IDs from path
    const { curriculumId, lessonId, classId, teacherId, seriesId } = useMemo(() => {
        const parts = pathWithoutLocale.split('/').filter(Boolean)
        const curriculumIndex = parts.indexOf('curriculums')
        const lessonIndex = parts.indexOf('lessons')
        const classIndex = parts.indexOf('classes')
        const teacherIndex = parts.indexOf('teachers')
        const classroomIndex = parts.indexOf('classroom')

        let roomParts = null
        if (classroomIndex !== -1 && parts[classroomIndex + 1]) {
            const roomName = decodeURIComponent(parts[classroomIndex + 1])
            roomParts = parseRoomName(roomName)
        }

        return {
            curriculumId: curriculumIndex !== -1 && parts[curriculumIndex + 1] && isConvexId(parts[curriculumIndex + 1])
                ? parts[curriculumIndex + 1] as Id<"curriculums">
                : null,
            lessonId: lessonIndex !== -1 && parts[lessonIndex + 1] && isConvexId(parts[lessonIndex + 1])
                ? parts[lessonIndex + 1] as Id<"lessons">
                : roomParts?.lessonId as Id<"lessons"> || null,
            classId: classIndex !== -1 && parts[classIndex + 1] && isConvexId(parts[classIndex + 1])
                ? parts[classIndex + 1] as Id<"classes">
                : roomParts?.classId as Id<"classes"> || null,
            teacherId: teacherIndex !== -1 && parts[teacherIndex + 1] && isConvexId(parts[teacherIndex + 1])
                ? parts[teacherIndex + 1] as Id<"users">
                : null,
            seriesId: roomParts?.seriesId || null,
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

    // Translation helper with proper typing
    const getTranslation = useCallback((part: string, fallback: string) => {
        const config = ROUTE_CONFIG[part]
        if (!config) return fallback

        try {
            switch (config.namespace) {
                case 'navigation':
                    return tNav(config.key) || fallback
                case 'classroom':
                    return tClass(config.key) || fallback
                case 'curriculums':
                    return tCurr(config.key) || fallback
                case 'lesson':
                    return tLesson(config.key) || fallback
                default:
                    return fallback
            }
        } catch {
            return fallback
        }
    }, [tNav, tClass, tCurr, tLesson])

    const breadcrumbSegments = useMemo((): BreadcrumbSegment[] => {
        const segments: BreadcrumbSegment[] = []

        // Handle root/dashboard
        if (!pathWithoutLocale || pathWithoutLocale === '/') {
            segments.push({
                title: tNav('dashboard'),
                isCurrentPage: true
            })
            return segments
        }

        // Split path and create segments
        const pathParts = pathWithoutLocale.split('/').filter(Boolean)
        
        // Check if this is a root-level curriculum/lesson that should be under teaching
        const needsTeachingPrefix = pathParts[0] === 'curriculums' || 
                                   (pathParts[0] === 'lessons' && !pathParts.includes('teaching'))

        // Build breadcrumb path
        pathParts.forEach((part, index) => {
            const isLast = index === pathParts.length - 1
            
            // Build the full path up to this point
            let fullPath = '/' + pathParts.slice(0, index + 1).join('/')
            
            // If this is root curriculums or lessons, redirect to teaching version
            if (index === 0 && needsTeachingPrefix) {
                fullPath = '/teaching' + fullPath
            } else if (needsTeachingPrefix && index > 0) {
                fullPath = '/teaching/' + pathParts.slice(0, index + 1).join('/')
            }

            let title: string
            
            // Handle room names (classroom routes)
            if (isRoomName(part)) {
                if (classData && lesson) {
                    // Classroom with a specific lesson
                    title = `${classData.name} - ${lesson.title}`
                } else if (classData && seriesId) {
                    // Classroom for a recurring series (no specific lesson)
                    title = classData.name
                } else if (classData) {
                    title = classData.name
                } else if (lesson) {
                    title = lesson.title
                } else {
                    title = tClass('classroom')
                }
            } 
            // Handle Convex IDs
            else if (isConvexId(part)) {
                if (curriculumId && part === curriculumId) {
                    title = curriculum?.title || tCurr('unknown')
                } else if (lessonId && part === lessonId) {
                    title = lesson?.title || tLesson('title')
                } else if (classId && part === classId) {
                    title = classData?.name || tNav('classes')
                } else if (teacherId && part === teacherId) {
                    title = teacher?.fullName || tNav('teachers')
                } else {
                    title = part
                }
            } 
            // Handle known routes
            else {
                title = getTranslation(part, part.charAt(0).toUpperCase() + part.slice(1))
            }

            segments.push({
                title,
                href: isLast ? undefined : fullPath,
                isCurrentPage: isLast
            })
        })
        
        // If we're at root curriculum/lesson, inject "Teaching" breadcrumb at the start
        if (needsTeachingPrefix) {
            segments.unshift({
                title: tNav('teaching'),
                href: '/teaching',
                isCurrentPage: false
            })
        }

        return segments
    }, [
        pathWithoutLocale,
        tNav,
        tClass,
        tCurr,
        tLesson,
        getTranslation,
        curriculumId,
        curriculum,
        lessonId,
        lesson,
        classId,
        classData,
        teacherId,
        teacher,
        seriesId,
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