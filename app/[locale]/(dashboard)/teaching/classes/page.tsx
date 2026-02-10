"use client"

import { useState, useMemo } from "react"
import { useQuery } from "convex/react"
import { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, BookOpen, Calendar, ArrowRight, School, Edit, LayoutGrid, List as ListIcon } from "lucide-react"
import { format } from "date-fns"
import { ClassDialog } from "@/components/teaching/classes/class-dialog"
import { ClassCombinedFilter } from "@/components/teaching/classes/class-combined-filter"
import { ClassesTable } from "@/components/teaching/classes/classes-table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function MyClassesPage() {
  const t = useTranslations()
  const { user, isLoading: isUserLoading } = useCurrentUser()
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"
  const [selectedTeacherId, setSelectedTeacherId] = useState<Id<"users"> | null>(null)
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<Id<"curriculums"> | null>(null)
  
  const queryArgs = isAdmin 
    ? (selectedTeacherId ? { teacherId: selectedTeacherId } : {}) 
    : (user ? { teacherId: user._id } : "skip")

  const allClasses = useQuery(api.classes.list, queryArgs)
  const curriculums = useQuery(api.curriculums.list, {})

  const classes = useMemo(() => {
    if (!allClasses) return undefined
    if (!selectedCurriculumId) return allClasses
    return allClasses.filter(cls => cls.curriculumId === selectedCurriculumId)
  }, [allClasses, selectedCurriculumId])

  if (isUserLoading || classes === undefined) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[200px] w-full" />)}
        </div>
      </div>
    )
  }

  const getCurriculumTitle = (id: string) => {
    return curriculums?.find(c => c._id === id)?.title || t('curriculum.unknown')
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isAdmin ? t('class.allClasses') : t('class.myClasses')}
          </h1>
          <p className="text-muted-foreground">
            {isAdmin ? t('class.manageAllDescription') : t('class.manageMyDescription')}
          </p>
        </div>
      </div>

      <Tabs defaultValue={isAdmin ? "list" : "grid"} className="w-full space-y-6">
        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <ClassCombinedFilter 
                selectedTeacherId={selectedTeacherId}
                onSelectTeacher={setSelectedTeacherId}
                selectedCurriculumId={selectedCurriculumId}
                onSelectCurriculum={setSelectedCurriculumId}
                isAdmin={isAdmin}
            />
            
            <TabsList>
                <TabsTrigger value="grid" className="gap-2">
                    <LayoutGrid className="h-4 w-4" /> Grid
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-2">
                    <ListIcon className="h-4 w-4" /> List
                </TabsTrigger>
            </TabsList>
        </div>

        {/* GRID VIEW */}
        <TabsContent value="grid">
            <div className="space-y-4">
                {isAdmin && (
                    <div className="flex justify-end">
                        <ClassDialog selectedTeacherId={selectedTeacherId} />
                    </div>
                )}

                {classes.length === 0 ? (
                    <EmptyState isAdmin={isAdmin} />
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {classes.map((cls) => (
                        <Card key={cls._id} className="group relative overflow-hidden transition-all hover:shadow-md flex flex-col">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                            <Badge variant={cls.isActive ? "default" : "secondary"}>
                                {cls.isActive ? t('common.active') : t('common.archived')}
                            </Badge>
                            {cls.academicYear && (
                                <Badge variant="outline" className="text-xs">
                                    {cls.academicYear}
                                </Badge>
                            )}
                            </div>
                            <CardTitle className="line-clamp-1 mt-2">{cls.name}</CardTitle>
                            <CardDescription className="flex items-center gap-2">
                            <BookOpen className="h-3.5 w-3.5" />
                            <span className="line-clamp-1">{getCurriculumTitle(cls.curriculumId)}</span>
                            </CardDescription>
                        </CardHeader>
                        
                        <CardContent className="flex flex-col gap-4 mt-auto">
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <span>{cls.students?.length || 0} {t('navigation.students')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>{cls.startDate ? format(cls.startDate, "MMM yyyy") : t('class.noDate')}</span>
                                </div>
                            </div>
                            
                            <div className="flex gap-2 pt-2 border-t">
                            <Button variant="outline" className="flex-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors" asChild>
                                <Link href={`/teaching/classes/${cls._id}`}>
                                {isAdmin ? t('class.manageClass') : t('class.manageSchedule')}
                                <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                            
                            {isAdmin && (
                                <ClassDialog 
                                classDoc={cls}
                                trigger={
                                    <Button variant="secondary" size="icon" className="shrink-0" title="Edit Class Details">
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                }
                                />
                            )}
                            </div>
                        </CardContent>
                        </Card>
                    ))}
                    </div>
                )}
            </div>
        </TabsContent>

        {/* LIST VIEW - Wrapped in Card for Visual Consistency */}
        <TabsContent value="list" className="mt-6">
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <School className="h-5 w-5 text-primary" />
                        {isAdmin ? "All Classes" : "My Classes"}
                    </CardTitle>
                    <CardDescription>
                        {isAdmin 
                            ? "View and manage all classes, assignments, and schedules." 
                            : "View your assigned classes and manage your schedule."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {classes.length === 0 ? (
                        <EmptyState isAdmin={isAdmin} />
                    ) : (
                        <ClassesTable 
                            data={classes} 
                            curriculums={curriculums ?? undefined} 
                        />
                    )}
                </CardContent>
             </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
    const t = useTranslations();
    return (
        <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
                <School className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">{t('class.noActive')}</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
                {isAdmin ? t('class.createPrompt') : t('class.notAssigned')}
            </p>
            {isAdmin && <ClassDialog />}
        </Card>
    )
}