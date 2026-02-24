"use client"

import { useState, useEffect } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id, Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Edit, Trash2, BookOpen, Users, PlusCircle, UserPlus, Calendar, Check, ChevronsUpDown } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { EntityDialog } from "@/components/ui/entity-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Interconnections
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog"
import { UserDialog } from "@/components/admin/users/user-dialog"
import { StudentManager } from "./student-manager"
import { useAlert } from "@/components/providers/alert-provider"

interface ClassDialogProps {
  classDoc?: Doc<"classes">
  selectedTeacherId?: Id<"users"> | null
  selectedCurriculumId?: Id<"curriculums"> | null
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ClassDialog({ 
  classDoc, 
  selectedTeacherId, 
  selectedCurriculumId, 
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange
}: ClassDialogProps) {
  const t = useTranslations()
  const { showAlert } = useAlert()
  const { user } = useCurrentUser()
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"
  
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = controlledOnOpenChange || setInternalOpen

  const [isEditing, setIsEditing] = useState(!!classDoc)
  const [currentClassId, setCurrentClassId] = useState<Id<"classes"> | undefined>(classDoc?._id)

  // API Hooks
  const createClass = useMutation(api.classes.create)
  const updateClass = useMutation(api.classes.update)
  const deleteClass = useMutation(api.classes.remove)
  
  const curriculums = useQuery(api.curriculums.list, { includeInactive: false })
  const teachers = useQuery(api.users.getUsers, isAdmin ? { role: "teacher" } : "skip")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openCurriculum, setOpenCurriculum] = useState(false)
  const [openTeacher, setOpenTeacher] = useState(false)
  
  const [formData, setFormData] = useState({
      name: "",
      description: "",
      academicYear: "",
      curriculumId: selectedCurriculumId ? selectedCurriculumId.toString() : "",
      teacherId: selectedTeacherId ? selectedTeacherId.toString() : ""
  })

  useEffect(() => {
    if (isOpen) {
        if (classDoc) {
            setIsEditing(true)
            setCurrentClassId(classDoc._id)
            setFormData({
                name: classDoc.name,
                description: classDoc.description || "",
                academicYear: classDoc.academicYear || "",
                curriculumId: classDoc.curriculumId,
                teacherId: classDoc.teacherId || ""
            })
        } else {
            if (!currentClassId) {
                setFormData({
                    name: "",
                    description: "",
                    academicYear: new Date().getFullYear().toString(),
                    curriculumId: selectedCurriculumId ? selectedCurriculumId.toString() : "",
                    teacherId: selectedTeacherId ? selectedTeacherId.toString() : (isAdmin ? "" : (user?._id || ""))
                })
            }
        }
    } else {
        if (!classDoc) {
            setIsEditing(false)
            setCurrentClassId(undefined)
        }
    }
  }, [isOpen, classDoc, selectedCurriculumId, selectedTeacherId, user, currentClassId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
        if (isEditing && currentClassId) {
            await updateClass({
                id: currentClassId,
                name: formData.name,
                description: formData.description || undefined,
                academicYear: formData.academicYear || undefined,
                curriculumId: formData.curriculumId as Id<"curriculums">,
                teacherId: formData.teacherId as Id<"users">,
            })
            toast.success(t('class.updated'))
            setIsOpen(false)
        } else {
            await createClass({
                name: formData.name.trim() || undefined,
                description: formData.description || undefined,
                academicYear: formData.academicYear || undefined,
                curriculumId: formData.curriculumId as Id<"curriculums">,
                teacherId: (isAdmin ? formData.teacherId : user?._id) as Id<"users">,
            })
            toast.success(t('class.created'))
            setIsOpen(false)
        }
    } catch {
        toast.error(t('errors.operationFailed'))
    } finally {
        setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!currentClassId) return
    showAlert({
        title: t('common.delete'),
        description: t('class.deleteConfirm'),
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
        variant: "destructive",
        onConfirm: async () => {
            try {
                await deleteClass({ id: currentClassId })
                toast.success(t('class.deleted'))
                setIsOpen(false)
            } catch {
                toast.error(t('errors.operationFailed'))
            }
        }
    })
  }

  const defaultTrigger = isEditing ? (
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" type="button">
        <Edit className="h-4 w-4 text-muted-foreground" />
    </Button>
  ) : (
    <Button className="gap-2" type="button">
      <Plus className="h-4 w-4" /> {t('class.new')}
    </Button>
  )

  return (
    <EntityDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        trigger={trigger || defaultTrigger}
        title={isEditing ? t('class.edit') : t('class.new')}
        description={isEditing ? t('class.editDescription') : t('class.description')}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitLabel={isEditing ? t('common.save') : t('class.createClass')}
        maxWidth="sm:max-w-[700px]"
        leftActions={isEditing && (
            <Button type="button" variant="destructive" onClick={handleDelete} className="mr-auto">
                <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete')}
            </Button>
        )}
    >
        <Tabs defaultValue="details" className="w-full">
            <TabsList className="w-full justify-start mb-4">
                <TabsTrigger value="details" className="gap-2">
                    <BookOpen className="h-4 w-4" /> {t('common.details')}
                </TabsTrigger>
                {isEditing && (
                    <TabsTrigger value="students" className="gap-2">
                        <Users className="h-4 w-4" /> {t('navigation.students')}
                    </TabsTrigger>
                )}
            </TabsList>

            <TabsContent value="details" className="space-y-4">
                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-2 gap-4 items-start">
                        <div className="flex flex-col gap-2 col-span-2 sm:col-span-1">
                            <Label className="flex items-center">
                              {t('class.name')}
                              <span className="text-xs text-muted-foreground ml-2 font-normal">
                                ({t('common.optional') || 'Optional'})
                              </span>
                            </Label>
                            <Input 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                placeholder={t('class.autoNameHint') || "Leave empty to auto-generate"}
                            />
                            <p className="text-[10px] text-muted-foreground leading-tight">
                               {t('class.autoNamePattern') || "Auto-format: Curriculum - Teacher - Year (Sec #)"}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 col-span-2 sm:col-span-1 mt-0.5">
                            <Label>{t('class.academicYear')}</Label>
                            <div className="relative">
                                <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    className="pl-9"
                                    value={formData.academicYear} 
                                    onChange={e => setFormData({...formData, academicYear: e.target.value})}
                                    placeholder="e.g. 2025-2026" 
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('common.description')}</Label>
                        <Textarea 
                            value={formData.description} 
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            placeholder={t('common.descriptionPlaceholder')}
                            className="h-20 resize-none"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('class.curriculum')} <span className="text-destructive">*</span></Label>
                        <div className="flex gap-2">
                            <Popover open={openCurriculum} onOpenChange={setOpenCurriculum}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={openCurriculum}
                                        className="flex-1 justify-between font-normal text-left overflow-hidden"
                                    >
                                        <span className="truncate">
                                            {formData.curriculumId
                                                ? curriculums?.find((c) => c._id === formData.curriculumId)?.title
                                                : t('class.selectCurriculum') || "Select curriculum..."}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder={t('common.search') || "Search curriculums..."} />
                                        <CommandList>
                                            <CommandEmpty>{t('common.noResults') || "No curriculums found."}</CommandEmpty>
                                            <CommandGroup>
                                                {curriculums?.slice().sort((a, b) => a.title.localeCompare(b.title)).map((curr) => (
                                                    <CommandItem
                                                        key={curr._id}
                                                        value={`${curr.title} ${curr.code || ''}`}
                                                        onSelect={() => {
                                                            setFormData({ ...formData, curriculumId: curr._id })
                                                            setOpenCurriculum(false)
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4 flex-shrink-0",
                                                                formData.curriculumId === curr._id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <span className="truncate font-medium">{curr.title}</span>
                                                            {(curr.code || (curr.gradeCodes && curr.gradeCodes.length > 0)) && (
                                                                <span className="text-[10px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded-sm flex-shrink-0 ml-auto">
                                                                    {[
                                                                        curr.code, 
                                                                        curr.gradeCodes && curr.gradeCodes.length > 0 ? `${curr.gradeCodes.join(", ")} Grade` : null
                                                                    ].filter(Boolean).join(" | ")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            
                            <CurriculumDialog 
                                trigger={
                                    <Button type="button" variant="outline" size="icon" title="Create Curriculum" className="shrink-0">
                                        <PlusCircle className="h-4 w-4" />
                                    </Button>
                                }
                            />
                        </div>
                    </div>

                    {isAdmin && (
                        <div className="grid gap-2">
                            <Label>{t('class.assignTeacher')} <span className="text-destructive">*</span></Label>
                            <div className="flex gap-2">
                                <Popover open={openTeacher} onOpenChange={setOpenTeacher}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openTeacher}
                                            className="flex-1 justify-between font-normal text-left overflow-hidden"
                                        >
                                            <span className="truncate">
                                                {teachers?.find((t) => t._id === formData.teacherId)?.fullName 
                                                    || t('class.selectTeacher') 
                                                    || "Select teacher..."}
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder={t('common.search') || "Search teachers..."} />
                                            <CommandList>
                                                <CommandEmpty>{t('common.noResults') || "No teachers found."}</CommandEmpty>
                                                <CommandGroup>
                                                    {teachers?.slice().sort((a, b) => a.fullName.localeCompare(b.fullName)).map((teacher) => (
                                                        <CommandItem
                                                            key={teacher._id}
                                                            value={`${teacher.fullName} ${teacher.email}`}
                                                            onSelect={() => {
                                                                setFormData({ ...formData, teacherId: teacher._id })
                                                                setOpenTeacher(false)
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4 flex-shrink-0",
                                                                    formData.teacherId === teacher._id ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="truncate font-medium">{teacher.fullName}</span>
                                                                <span className="text-[10px] text-muted-foreground truncate">{teacher.email}</span>
                                                            </div>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>

                                <UserDialog 
                                    defaultRole="teacher"
                                    allowedRoles={["teacher"]}
                                    trigger={
                                        <Button type="button" variant="outline" size="icon" title="Create Teacher" className="shrink-0">
                                            <UserPlus className="h-4 w-4" />
                                        </Button>
                                    }
                                />
                            </div>
                        </div>
                    )}
                </div>
            </TabsContent>

            {isEditing && currentClassId && (
                <TabsContent value="students" className="min-h-[300px]">
                    <div className="space-y-4">
                         <div className="rounded-md border p-4 bg-background">
                            <StudentManager 
                                classId={currentClassId} 
                                curriculumId={formData.curriculumId as Id<"curriculums">} 
                            />
                         </div>
                    </div>
                </TabsContent>
            )}
        </Tabs>
    </EntityDialog>
  )
}