"use client"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Filter, X } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Id } from "@/convex/_generated/dataModel"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"

interface ClassCombinedFilterProps {
  selectedTeacherId: Id<"users"> | null
  onSelectTeacher: (id: Id<"users"> | null) => void
  selectedCurriculumId: Id<"curriculums"> | null
  onSelectCurriculum: (id: Id<"curriculums"> | null) => void
  isAdmin: boolean
}

export function ClassCombinedFilter({ 
  selectedTeacherId, 
  onSelectTeacher,
  selectedCurriculumId,
  onSelectCurriculum,
  isAdmin 
}: ClassCombinedFilterProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [teacherSearch, setTeacherSearch] = useState("")
  const [curriculumSearch, setCurriculumSearch] = useState("")

  const teachers = useQuery(api.users.getTeachers)
  const curriculums = useQuery(api.curriculums.list, { includeInactive: false })
  
  const selectedTeacher = teachers?.find(t => t._id === selectedTeacherId)
  const selectedCurriculum = curriculums?.find(c => c._id === selectedCurriculumId)

  const hasActiveFilters = selectedTeacherId || selectedCurriculumId

  const filteredTeachers = teachers?.filter(teacher =>
    teacher.fullName.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    teacher.email.toLowerCase().includes(teacherSearch.toLowerCase())
  )

  const filteredCurriculums = curriculums?.filter(curriculum =>
    curriculum.title.toLowerCase().includes(curriculumSearch.toLowerCase()) ||
    curriculum.code?.toLowerCase().includes(curriculumSearch.toLowerCase())
  )

  const clearAllFilters = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelectTeacher(null)
    onSelectCurriculum(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={hasActiveFilters ? "secondary" : "outline"}
          size="sm"
          className="gap-2 group"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">
            {hasActiveFilters ? t("class.filtered") : t("class.filterBy")}
          </span>
          {hasActiveFilters && (
            <>
              <Badge variant="outline" className="ml-1 px-1.5 py-0 h-5">
                {(selectedTeacherId ? 1 : 0) + (selectedCurriculumId ? 1 : 0)}
              </Badge>
              <div
                role="button"
                className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 cursor-pointer relative z-50"
                onClick={clearAllFilters}
              >
                <X className="h-3 w-3" />
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Tabs defaultValue="curriculum" className="w-full">
          <div className="p-3 border-b space-y-3">
            <TabsList className={`grid w-full ${isAdmin ? "grid-cols-2" : "grid-cols-1"}`}>
              <TabsTrigger value="curriculum">{t("navigation.curriculum")}</TabsTrigger>
              {isAdmin && <TabsTrigger value="teacher">{t("navigation.teacher")}</TabsTrigger>}
            </TabsList>
            
            {/* Active Filters Display */}
            {hasActiveFilters && (
              <div className="space-y-2">
                {selectedTeacher && (
                  <div className="flex items-center justify-between text-xs bg-muted px-2 py-1.5 rounded">
                    <span className="truncate">{selectedTeacher.fullName}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectTeacher(null)
                      }}
                      className="ml-2 hover:bg-background rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {selectedCurriculum && (
                  <div className="flex items-center justify-between text-xs bg-muted px-2 py-1.5 rounded">
                    <span className="truncate">{selectedCurriculum.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectCurriculum(null)
                      }}
                      className="ml-2 hover:bg-background rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <TabsContent value="curriculum" className="m-0">
            <div className="p-3 border-b">
              <Input
                placeholder={t("curriculum.search")}
                value={curriculumSearch}
                onChange={(e) => setCurriculumSearch(e.target.value)}
                className="h-9"
              />
            </div>
            <ScrollArea className="h-[300px]">
              <div className="p-2">
                {filteredCurriculums?.map((curriculum) => (
                  <button
                    key={curriculum._id}
                    onClick={() => {
                      onSelectCurriculum(curriculum._id)
                      setOpen(false)
                      setCurriculumSearch("")
                    }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 rounded-md text-left
                      hover:bg-muted transition-colors
                      ${selectedCurriculumId === curriculum._id ? "bg-muted" : ""}
                    `}
                  >
                    <div 
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: curriculum.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{curriculum.title}</p>
                      {curriculum.code && (
                        <p className="text-xs text-muted-foreground truncate">
                          {curriculum.code}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
                {filteredCurriculums?.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    {t("curriculum.noResults")}
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="teacher" className="m-0">
              <div className="p-3 border-b">
                <Input
                  placeholder={t("teacher.search")}
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="h-9"
                />
              </div>
              <ScrollArea className="h-[300px]">
                <div className="p-2">
                  {filteredTeachers?.map((teacher) => (
                    <button
                      key={teacher._id}
                      onClick={() => {
                        onSelectTeacher(teacher._id)
                        setOpen(false)
                        setTeacherSearch("")
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
                      {t("teacher.noResults")}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}