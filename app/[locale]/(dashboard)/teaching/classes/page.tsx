"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, BookOpen, Calendar, ArrowRight, School } from "lucide-react"
import { format } from "date-fns"
import { CreateClassDialog } from "@/components/teaching/classes/create-class-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function MyClassesPage() {
  const { user, isLoading: isUserLoading } = useCurrentUser()
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"
  
  // LOGIC: If Admin -> Fetch ALL classes. If Teacher -> Fetch MY classes.
  const queryArgs = isAdmin 
    ? {} // No filters = All classes
    : (user ? { teacherId: user._id } : "skip")

  const classes = useQuery(api.classes.list, queryArgs)

  // Optimization: Fetch curriculums for titles (cached by Convex)
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
          <h1 className="text-3xl font-bold tracking-tight">
            {isAdmin ? "All Active Classes" : "My Classes"}
          </h1>
          <p className="text-muted-foreground">
            {isAdmin 
              ? "Manage all classes, assignments, and schedules across the platform."
              : "Manage your active student groups and schedules."}
          </p>
        </div>
        {/* Only Admins can create classes (per schema/mutation logic) */}
        {isAdmin && <CreateClassDialog />}
      </div>

      {classes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <School className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No active classes found</h3>
          <p className="text-muted-foreground mb-4 max-w-sm">
            {isAdmin 
              ? "Create a class to start enrolling students." 
              : "You haven't been assigned to any classes yet."}
          </p>
          {isAdmin && <CreateClassDialog />}
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
                  
                  {/* Both Admin and Teacher go to the same Detail Page */}
                  <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground" asChild>
                    <Link href={`/teaching/classes/${cls._id}`}>
                      {isAdmin ? "Manage Class" : "Manage Schedule"}
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