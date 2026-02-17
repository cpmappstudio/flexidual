"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Loader2, Plus, Search, UserPlus, Filter } from "lucide-react"
import { toast } from "sonner"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { parseConvexError, getErrorMessage } from "@/lib/error-utils"
import { Badge } from "@/components/ui/badge"

interface AddStudentDialogProps {
  classId: Id<"classes">
  curriculumId?: Id<"curriculums">
}

export function AddStudentDialog({ classId, curriculumId }: AddStudentDialogProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const t = useTranslations()
  const locale = useLocale()
  
  // 1. Fetch Curriculum to get target grades
  const curriculum = useQuery(api.curriculums.get, 
    curriculumId ? { id: curriculumId } : "skip"
  )

  const gradeCodes = curriculum?.gradeCodes || []

  // 2. Search Query - Removed the "length >= 2" check
  const searchResults = useQuery(api.classes.searchStudents, {
    searchQuery: search, 
    excludeClassId: classId,
    gradeCodes: gradeCodes.length > 0 ? gradeCodes : undefined
  })

  const addStudent = useMutation(api.classes.addStudent)

  const handleAdd = async (studentId: Id<"users">, name: string) => {
    try {
      await addStudent({ classId, studentId })
      toast.success(t("class.studentAdded", { name }))
    } catch (error) {
      const parsedError = parseConvexError(error)
      if (parsedError) {
        toast.error(getErrorMessage(parsedError, t, locale))
      } else {
        toast.error(t("errors.operationFailed"))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          {t("class.enrollStudent")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("class.enrollStudent")}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          {gradeCodes.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md flex items-start gap-3 border border-blue-100 dark:border-blue-800">
                <Filter className="h-4 w-4 text-blue-500 mt-1" />
                <div className="text-sm">
                    <p className="font-medium text-blue-700 dark:text-blue-300">
                        {t('student.filteringByGrade')}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                        {gradeCodes.map(code => (
                            <Badge key={code} variant="secondary" className="bg-white/50 text-xs">
                                {t(`student.grades.${code}`)}
                            </Badge>
                        ))}
                    </div>
                </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("student.searchPlaceholder")}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-h-[250px] max-h-[400px] overflow-y-auto space-y-2 pr-1">
            {!searchResults ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                 <p>{t("student.noResults")}</p>
                 {gradeCodes.length > 0 && (
                     <p className="text-xs mt-1 opacity-70">
                        Try clearing filters or adding students to the platform first.
                     </p>
                 )}
              </div>
            ) : (
              searchResults.map((student) => (
                <div key={student._id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
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

                    <div className="text-sm">
                      <div className="flex items-center gap-2">
                          <p className="font-medium">{student.fullName}</p>
                          {student.grade && (
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
                                  {t(`student.grades.${student.grade}`)}
                              </Badge>
                          )}
                      </div>
                      <p className="text-xs text-muted-foreground">{student.email}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" className="h-8" onClick={() => handleAdd(student._id, student.fullName)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {t('common.add')}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}