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
import { Loader2, Plus, Search, UserPlus } from "lucide-react"
import { toast } from "sonner"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { parseConvexError, getErrorMessage } from "@/lib/error-utils"
import { ConvexError } from "convex/values"

interface AddStudentDialogProps {
  classId: Id<"classes">
}

export function AddStudentDialog({ classId }: AddStudentDialogProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const t = useTranslations()
  const locale = useLocale()
  const searchResults = useQuery(api.classes.searchStudents, 
    search.length >= 2 ? { searchQuery: search, excludeClassId: classId } : "skip"
  )

  const addStudent = useMutation(api.classes.addStudent)

  const handleAdd = async (studentId: Id<"users">, name: string) => {
    try {
      await addStudent({ classId, studentId })
      toast.success(t("class.studentAdded", { name }))
    } catch (error) {
      const parsedError = parseConvexError(error)
      
      if (parsedError) {
        const errorMessage = getErrorMessage(parsedError, t, locale)
        toast.error(errorMessage)
      } else {
        toast.error(t("errors.operationFailed"))
        console.error("Unexpected error:", error)
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("class.enrollStudent")}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("student.searchPlaceholder")}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-h-[200px] space-y-2">
            {search.length < 2 ? (
              <p className="text-sm text-center text-muted-foreground py-8">
                {t("student.searchMinChars")}
              </p>
            ) : !searchResults ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-8">
                {t("student.noResults")}
              </p>
            ) : (
              searchResults.map((student) => (
                <div key={student._id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50">
                  <div className="flex items-center gap-3">
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

                    <div className="text-sm">
                      <p className="font-medium">{student.fullName}</p>
                      <p className="text-xs text-muted-foreground">{student.email}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleAdd(student._id, student.fullName)}>
                    <Plus className="h-4 w-4" />
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