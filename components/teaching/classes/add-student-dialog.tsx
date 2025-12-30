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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
// import { useDebounce } from "@/hooks/use-debounce" // We might need to create this hook or just use timeout

interface AddStudentDialogProps {
  classId: Id<"classes">
}

export function AddStudentDialog({ classId }: AddStudentDialogProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  // Debounce search to save API calls (optional, but good practice)
  // For now we pass search directly
  
  const searchResults = useQuery(api.classes.searchStudents, 
    search.length >= 2 ? { searchQuery: search, excludeClassId: classId } : "skip"
  )

  const addStudent = useMutation(api.classes.addStudent)

  const handleAdd = async (studentId: Id<"users">, name: string) => {
    try {
      await addStudent({ classId, studentId })
      toast.success(`Added ${name} to class`)
      // Keep dialog open to add more? Or close? Let's keep it open.
    } catch (error) {
      toast.error("Failed to add student")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Enroll Student
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enroll Students</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-h-[200px] space-y-2">
            {search.length < 2 ? (
              <p className="text-sm text-center text-muted-foreground py-8">
                Type at least 2 characters to search.
              </p>
            ) : !searchResults ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-8">
                No students found.
              </p>
            ) : (
              searchResults.map((student) => (
                <div key={student._id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={""} /> {/* We need avatar url logic if avail */}
                      <AvatarFallback>{student.fullName.substring(0,2)}</AvatarFallback>
                    </Avatar>
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