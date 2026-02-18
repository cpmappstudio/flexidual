"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Trash2, MoreVertical, Loader2 } from "lucide-react"
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
import { useAlert } from "@/components/providers/alert-provider"

interface StudentManagerProps {
  classId: Id<"classes">
  curriculumId?: Id<"curriculums">
}

export function StudentManager({ classId, curriculumId }: StudentManagerProps) {
  const { user } = useCurrentUser()
  const t = useTranslations()
  const { showAlert } = useAlert()
  const students = useQuery(api.classes.getStudents, { classId })
  const removeStudent = useMutation(api.classes.removeStudent)
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"

  const handleRemove = async (studentId: Id<"users">, name: string) => {
    showAlert({
      title: t('student.removeFromClass'),
      description: t('class.removeConfirm', { name }),
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      variant: "default",
      onConfirm: async () => {
        try {
          await removeStudent({ classId, studentId })
          toast.success(t('class.studentRemoved'))
        } catch {
          toast.error(t('errors.operationFailed'))
        }
      }
    })
  }

  if (students === undefined) {
    return <Skeleton className="h-[300px] w-full" />
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{students?.length || 0} {students?.length === 1 ? 'student' : 'students'}</span>
          </div>
          {isAdmin && <AddStudentDialog classId={classId} curriculumId={curriculumId} />}
      </div>
      {students.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          {t("class.noStudents")}
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
    </div>
  )
}