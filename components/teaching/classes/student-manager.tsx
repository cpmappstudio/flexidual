"use client"

import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Trash2, MoreVertical, Camera, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AddStudentDialog } from "./add-student-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useParams } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { getRoleForOrg, isSuperAdmin } from "@/lib/rbac"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useAlert } from "@/components/providers/alert-provider"
import { useState } from "react"

interface StudentManagerProps {
  classId: Id<"classes">
  curriculumId?: Id<"curriculums">
}

export function StudentManager({ classId, curriculumId }: StudentManagerProps) {
  const t = useTranslations()
  const { showAlert } = useAlert()
  const students = useQuery(api.classes.getStudents, { classId })
  const removeStudent = useMutation(api.classes.removeStudent)
  const updateUser = useAction(api.users.updateUserWithClerk)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const params = useParams()
  const orgSlug = (params.orgSlug as string) || "system"
  const { sessionClaims } = useAuth()
  const role = getRoleForOrg(sessionClaims, orgSlug)
  const isAdmin = isSuperAdmin(sessionClaims) || role === "admin" || role === "principal"
  const canEditProfile = isAdmin || role === "teacher" || role === "tutor"

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

  const handleImageUpload = async (studentId: Id<"users">, file: File) => {
    if (!file) return;
    setUploadingId(studentId);
    
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        await updateUser({
          userId: studentId,
          updates: {
            imageBase64: base64.startsWith("data:image") ? base64 : undefined,
          },
          orgType: "campus",
        });
        toast.success(t("userDialog.updateSuccess", { name: "Profile picture" }) || "Picture updated successfully");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      toast.error(t("userDialog.failedUpload") || "Failed to upload picture");
    } finally {
      setUploadingId(null);
    }
  };

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
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted group">
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

                  {canEditProfile && (
                    <label 
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title={student.imageUrl ? t("userDialog.updatePicture") : t("userDialog.addPicture")}
                    >
                      {uploadingId === student._id ? (
                        <Loader2 className="h-4 w-4 text-white animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4 text-white" />
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden"
                        disabled={uploadingId === student._id}
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleImageUpload(student._id, e.target.files[0]);
                            e.target.value = ""; 
                          }
                        }}
                      />
                    </label>
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