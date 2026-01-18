"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Trash2, MoreVertical } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AddStudentDialog } from "./add-student-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useCurrentUser } from "@/hooks/use-current-user"
import Image from "next/image"
import { useTranslations } from "next-intl"

interface StudentManagerProps {
  classId: Id<"classes">
}

export function StudentManager({ classId }: StudentManagerProps) {
  const { user } = useCurrentUser()
  const t = useTranslations()
  const students = useQuery(api.classes.getStudents, { classId })
  const removeStudent = useMutation(api.classes.removeStudent)
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"

  const handleRemove = async (studentId: Id<"users">, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from this class?`)) return
    
    try {
      await removeStudent({ classId, studentId })
      toast.success("Student removed")
    } catch (error) {
      toast.error("Failed to remove student: " + (error as Error).message)
    }
  }

  if (students === undefined) {
    return <Skeleton className="h-[300px] w-full" />
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t("navigation.students")} ({students.length})</CardTitle>
          <CardDescription>{t("class.manageEnrollment")}</CardDescription>
        </div>
        
        {isAdmin && <AddStudentDialog classId={classId} />}
      </CardHeader>
      <CardContent>
        {students.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            No students enrolled yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((student) => (
              <div key={student._id} className="flex items-center justify-between p-4 border rounded-lg bg-card shadow-sm">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                    {student.imageUrl ? (
                      <Image 
                        src={student.imageUrl} 
                        alt={student.fullName}
                        height={64}
                        width={64}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
                        {student.fullName.substring(0, 2)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="font-medium truncate">{student.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                  </div>
                </div>
                
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => handleRemove(student._id, student.fullName)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("student.removeFromClass")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}