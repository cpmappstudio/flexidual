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

type TranslationKey = 'dashboard' | 'calendar' | 'administration' | 
                      'curriculums' | 'lessons' | 'classes' | 'teachers' | 'students' | 'users' |
                      'classroom' | 'unknown' | 'title';

const ROUTE_CONFIG: Record<string, { key: TranslationKey; namespace?: string }> = {
    'calendar': { key: 'calendar', namespace: 'navigation' },
    'admin': { key: 'administration', namespace: 'navigation' },
    'curriculums': { key: 'curriculums', namespace: 'navigation' },
    'lessons': { key: 'lessons', namespace: 'navigation' },
    'classes': { key: 'classes', namespace: 'navigation' },
    'teachers': { key: 'teachers', namespace: 'navigation' },
    'students': { key: 'students', namespace: 'navigation' },
    'classroom': { key: 'classroom', namespace: 'classroom' },
    'users': { key: 'users', namespace: 'navigation' },
}

const isConvexId = (segment: string): boolean => {
    return segment.length > 20 && /^[a-z0-9]+$/.test(segment)
}

const isRoomName = (segment: string): boolean => {
    return segment.startsWith('class-')
}

const parseRoomName = (roomName: string): { classId: string; lessonId?: string; seriesId?: string } | null => {
    let match = roomName.match(/^class-([a-z0-9]+)-lesson-([a-z0-9]+)/)
    if (match) return { classId: match[1], lessonId: match[2] }
    
    match = roomName.match(/^class-([a-z0-9]+)-series-(\d+)/)
    if (match) return { classId: match[1], seriesId: match[2] }

    match = roomName.match(/^class-([a-z0-9]+)-(\d{10,})$/)
    if (match) return { classId: match[1], seriesId: match[2] }

    match = roomName.match(/^class-([a-z0-9]+)/)
    if (match) return { classId: match[1] }

    return null
}

// Helper to format the orgSlug nicely (e.g., "boston-public" -> "Boston Public")
const formatSlugToName = (slug: string) => {
    return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export const DynamicBreadcrumb = memo(function DynamicBreadcrumb() {
    const pathname = usePathname()
    const tNav = useTranslations('navigation')
    const tClass = useTranslations('classroom')
    const tCurr = useTranslations('curriculum')
    const tLesson = useTranslations('lesson')

    const pathWithoutLocale = useMemo(() => {
        return pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/, '')
    }, [pathname])

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
                ? parts[curriculumIndex + 1] as Id<"curriculums"> : null,
            lessonId: lessonIndex !== -1 && parts[lessonIndex + 1] && isConvexId(parts[lessonIndex + 1])
                ? parts[lessonIndex + 1] as Id<"lessons"> : roomParts?.lessonId as Id<"lessons"> || null,
            classId: classIndex !== -1 && parts[classIndex + 1] && isConvexId(parts[classIndex + 1])
                ? parts[classIndex + 1] as Id<"classes"> : roomParts?.classId as Id<"classes"> || null,
            teacherId: teacherIndex !== -1 && parts[teacherIndex + 1] && isConvexId(parts[teacherIndex + 1])
                ? parts[teacherIndex + 1] as Id<"users"> : null,
            seriesId: roomParts?.seriesId || null,
        }
    }, [pathWithoutLocale])

    const curriculum = useQuery(api.curriculums.get, curriculumId ? { id: curriculumId } : "skip")
    const lesson = useQuery(api.lessons.get, lessonId ? { id: lessonId } : "skip")
    const classData = useQuery(api.classes.get, classId ? { id: classId } : "skip")
    const teacher = useQuery(api.users.getUser, teacherId ? { userId: teacherId } : "skip")

    const getTranslation = useCallback((part: string, fallback: string) => {
        const config = ROUTE_CONFIG[part]
        if (!config) return fallback
        try {
            switch (config.namespace) {
                case 'navigation': return tNav(config.key) || fallback
                case 'classroom': return tClass(config.key) || fallback
                case 'curriculums': return tCurr(config.key) || fallback
                case 'lesson': return tLesson(config.key) || fallback
                default: return fallback
            }
        } catch {
            return fallback
        }
    }, [tNav, tClass, tCurr, tLesson])

    const breadcrumbSegments = useMemo((): BreadcrumbSegment[] => {
        const segments: BreadcrumbSegment[] = []
        const pathParts = pathWithoutLocale.split('/').filter(Boolean)

        if (pathParts.length === 0) {
            return [{ title: tNav('dashboard'), isCurrentPage: true }]
        }

        pathParts.forEach((part, index) => {
            const isLast = index === pathParts.length - 1
            const fullPath = '/' + pathParts.slice(0, index + 1).join('/')
            let title: string
            
            // The first part of the URL is always the context (admin or the orgSlug)
            if (index === 0) {
                title = part === 'admin' ? tNav('administration') : formatSlugToName(part)
            }
            else if (isRoomName(part)) {
                if (classData && lesson) title = `${classData.name} - ${lesson.title}`
                else if (classData) title = classData.name
                else if (lesson) title = lesson.title
                else title = tClass('classroom')
            } 
            else if (isConvexId(part)) {
                if (curriculumId && part === curriculumId) title = curriculum?.title || tCurr('unknown')
                else if (lessonId && part === lessonId) title = lesson?.title || tLesson('title')
                else if (classId && part === classId) title = classData?.name || tNav('classes')
                else if (teacherId && part === teacherId) title = teacher?.fullName || tNav('teachers')
                else title = part
            } 
            else {
                title = getTranslation(part, part.charAt(0).toUpperCase() + part.slice(1))
            }

            segments.push({
                title,
                href: isLast ? undefined : fullPath,
                isCurrentPage: isLast
            })
        })

        return segments
    }, [
        pathWithoutLocale, tNav, tClass, tCurr, tLesson, getTranslation,
        curriculumId, curriculum, lessonId, lesson, classId, classData,
        teacherId, teacher, seriesId,
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