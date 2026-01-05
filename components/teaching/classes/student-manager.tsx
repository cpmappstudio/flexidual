"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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

interface StudentManagerProps {
  classId: Id<"classes">
}

export function StudentManager({ classId }: StudentManagerProps) {
  const students = useQuery(api.classes.getStudents, { classId })
  const removeStudent = useMutation(api.classes.removeStudent)

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
          <CardTitle>Students ({students.length})</CardTitle>
          <CardDescription>Manage enrollment for this class.</CardDescription>
        </div>
        <AddStudentDialog classId={classId} />
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
                  <Avatar>
                    <AvatarFallback>{student.fullName.substring(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{student.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                  </div>
                </div>
                
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
                      Remove from Class
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}