"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, BookOpen, Calendar, ArrowRight } from "lucide-react"
import { format } from "date-fns"
import { CreateClassDialog } from "@/components/teaching/classes/create-class-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"

export default function MyClassesPage() {
  const { user, isLoading: isUserLoading } = useCurrentUser()
  
  // 1. Fetch Classes for this teacher
  const classes = useQuery(api.classes.list, 
    user ? { teacherId: user._id } : "skip"
  )

  // 2. Fetch Curriculums to show titles (optimization: separate query or join in backend)
  // For now, client-side lookup is fine for < 100 items
  const curriculums = useQuery(api.curriculums.list, {})

  if (isUserLoading || classes === undefined) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[200px] w-full" />
          ))}
        </div>
      </div>
    )
  }

  const getCurriculumTitle = (id: string) => {
    return curriculums?.find(c => c._id === id)?.title || "Unknown Curriculum"
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Classes</h1>
          <p className="text-muted-foreground">
            Manage your active student groups and schedules.
          </p>
        </div>
        <CreateClassDialog />
      </div>

      {classes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No active classes</h3>
          <p className="text-muted-foreground mb-4 max-w-sm">
            You haven't created any classes yet. Create a class to start enrolling students and scheduling lessons.
          </p>
          <CreateClassDialog />
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <Card key={cls._id} className="group relative overflow-hidden transition-all hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant={cls.isActive ? "default" : "secondary"}>
                    {cls.isActive ? "Active" : "Archived"}
                  </Badge>
                  {/* Future: Add "Manage" dropdown here */}
                </div>
                <CardTitle className="line-clamp-1 mt-2">{cls.name}</CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="line-clamp-1">{getCurriculumTitle(cls.curriculumId)}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{cls.students?.length || 0} Students</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{cls.startDate ? format(cls.startDate, "MMM yyyy") : "No date"}</span>
                    </div>
                  </div>
                  
                  {/* Link to the Schedule/Calendar for this class */}
                  <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground" asChild>
                    <Link href={`/teaching/classes/${cls._id}`}>
                      Manage Schedule
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}