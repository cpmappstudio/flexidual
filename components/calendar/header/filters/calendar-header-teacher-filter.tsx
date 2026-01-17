"use client"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Filter, X } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useCalendarContext } from "../../calendar-context"
import Image from "next/image"

export default function CalendarHeaderTeacherFilter() {
  const { selectedTeacherId, onTeacherChange } = useCalendarContext()
  const { user } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const teachers = useQuery(api.users.getTeachers)
  const selectedTeacher = teachers?.find(t => t._id === selectedTeacherId)

  // Only show for admins
  if (!user || !["admin", "superadmin"].includes(user.role)) {  
    return null
  }

  const filteredTeachers = teachers?.filter(teacher =>
    teacher.fullName.toLowerCase().includes(search.toLowerCase()) ||
    teacher.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={selectedTeacherId ? "secondary" : "outline"}
          size="sm"
          className="gap-2 group"
        >
          <Filter className="h-4 w-4" />
          {selectedTeacher ? (
            <>
              <span className="hidden sm:inline">{selectedTeacher.fullName}</span>
              <div
                role="button"
                className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 cursor-pointer relative z-50"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onTeacherChange(null);
                }}
              >
                <X className="h-3 w-3" />
              </div>
            </>
          ) : (
            <span className="hidden sm:inline">Filter by Teacher</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <Input
            placeholder="Search teachers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-2">
            {filteredTeachers?.map((teacher) => (
              <button
                key={teacher._id}
                onClick={() => {
                  onTeacherChange(teacher._id)
                  setOpen(false)
                  setSearch("")
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-md text-left
                  hover:bg-muted transition-colors
                  ${selectedTeacherId === teacher._id ? "bg-muted" : ""}
                `}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border border-white dark:border-gray-800 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                    {teacher.imageUrl ? (
                      <Image 
                        src={teacher.imageUrl} 
                        alt={teacher.fullName}
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-white">
                        {teacher.fullName.charAt(0)}
                      </span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{teacher.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {teacher.email}
                  </p>
                </div>
              </button>
            ))}
            {filteredTeachers?.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No teachers found
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}