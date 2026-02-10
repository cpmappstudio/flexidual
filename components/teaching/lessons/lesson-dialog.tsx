"use client"

import { useState, useEffect } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Pencil, Trash2, PlusCircle, X, Layers } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { EntityDialog } from "@/components/ui/entity-dialog"
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

interface LessonDialogProps {
  curriculumId?: Id<"curriculums">
  lesson?: Doc<"lessons">
  trigger?: React.ReactNode
}

type PendingLesson = {
    id: string
    title: string
    description: string
    content: string
}

export function LessonDialog({ curriculumId: defaultCurriculumId, lesson, trigger }: LessonDialogProps) {
  const t = useTranslations()
  const isEditing = !!lesson

  // API Hooks
  const createBatch = useMutation(api.lessons.createBatch)
  const update = useMutation(api.lessons.update)
  const remove = useMutation(api.lessons.remove)
  
  const curriculums = useQuery(api.curriculums.list, 
    defaultCurriculumId ? "skip" : { includeInactive: false }
  )

  // State
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [queue, setQueue] = useState<PendingLesson[]>([])

  const [formData, setFormData] = useState({
      title: "",
      description: "",
      content: "",
      curriculumId: defaultCurriculumId || ""
  })

  useEffect(() => {
    if (isOpen) {
        if (isEditing && lesson) {
            setFormData({
                title: lesson.title,
                description: lesson.description || "",
                content: lesson.content || "",
                curriculumId: lesson.curriculumId || defaultCurriculumId || ""
            })
        } else {
            setQueue([])
            setFormData({ 
                title: "", 
                description: "", 
                content: "", 
                curriculumId: defaultCurriculumId || "" 
            })
        }
    }
  }, [isOpen, isEditing, lesson, defaultCurriculumId])

  // --- BATCH HANDLERS ---
  const handleAddToQueue = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title) return

    const newItem: PendingLesson = {
        id: Math.random().toString(36).substr(2, 9),
        title: formData.title,
        description: formData.description,
        content: formData.content
    }

    setQueue([...queue, newItem])
    setFormData(prev => ({ ...prev, title: "", description: "", content: "" }))
  }

  const handleRemoveFromQueue = (id: string) => {
    setQueue(queue.filter(q => q.id !== id))
  }

  // --- SUBMIT HANDLERS ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.curriculumId) {
        toast.error("Please select a curriculum first")
        return
    }

    setIsSubmitting(true)

    try {
        if (isEditing && lesson) {
             await update({
                id: lesson._id,
                title: formData.title,
                description: formData.description || undefined,
                content: formData.content || undefined,
            })
            toast.success(t('lesson.updated'))
            setIsOpen(false)
        } else {
            // Check if we have a "single create" attempt (form filled but not added to queue)
            const finalQueue = [...queue]
            if (finalQueue.length === 0 && formData.title) {
                finalQueue.push({
                    id: "temp",
                    title: formData.title,
                    description: formData.description,
                    content: formData.content
                })
            }

            if (finalQueue.length === 0) return

             await createBatch({
                curriculumId: formData.curriculumId as Id<"curriculums">,
                lessons: finalQueue.map(q => ({
                    title: q.title,
                    description: q.description || undefined,
                    content: q.content || undefined
                }))
            })
            
            toast.success(`${finalQueue.length} lessons created`)
            setIsOpen(false)
        }
    } catch (error) {
        toast.error(t('errors.operationFailed') + (error instanceof Error ? `: ${error.message}` : ""))
    } finally {
        setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!lesson || !confirm(t('lesson.deleteConfirm'))) return
    try {
      await remove({ id: lesson._id })
      toast.success(t('lesson.deleted'))
      setIsOpen(false)
    } catch {
      toast.error(t('errors.operationFailed'))
    }
  }

  const dialogTitle = isEditing ? t('lesson.edit') : "Add Lessons"
  const dialogDesc = isEditing ? "Update lesson details." : "Create one or multiple lessons."
  
  // Calculate button label
  const createLabel = queue.length > 0 
    ? `Create All (${queue.length})` 
    : (formData.title ? "Create Lesson" : "Create")

  return (
    <EntityDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger || (isEditing ? (
        <Button variant="ghost" size="icon" className="h-8 w-8" type="button">
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
      ) : (
        <Button size="sm" className="gap-2" type="button">
          <Plus className="h-4 w-4" />
          {t('common.add')} {t('navigation.lessons')}
        </Button>
      ))}
      title={dialogTitle}
      description={dialogDesc}
      // FIXED: Always use handleSubmit, even for Batch
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEditing ? t('common.save') : createLabel}
      maxWidth="sm:max-w-[700px]"
      leftActions={isEditing && (
        <Button type="button" variant="destructive" onClick={handleDelete} className="mr-auto">
            <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete')}
        </Button>
      )}
    >
        <div className="space-y-6">
            {!defaultCurriculumId && (
                <div className="grid gap-2 p-4 bg-muted/30 rounded-lg border">
                    <Label>{t('navigation.curriculums')} <span className="text-destructive">*</span></Label>
                    <div className="flex gap-2">
                        <Select 
                            value={formData.curriculumId} 
                            onValueChange={(val) => setFormData({...formData, curriculumId: val})}
                        >
                            <SelectTrigger className="w-full bg-background">
                                <SelectValue placeholder="Select a curriculum..." />
                            </SelectTrigger>
                            <SelectContent>
                                {curriculums?.map((c) => (
                                    <SelectItem key={c._id} value={c._id}>{c.title}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <CurriculumDialog 
                            trigger={
                                <Button type="button" variant="outline" size="icon" title="Create new curriculum">
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            }
                        />
                    </div>
                </div>
            )}

            <div className={`space-y-4 ${!isEditing ? "p-4 border rounded-lg bg-card shadow-sm" : ""}`}>
                 <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">
                        {isEditing ? "Lesson Details" : "New Lesson Entry"}
                    </Label>
                    {!isEditing && (
                        <Badge variant="outline" className="text-xs">
                             {defaultCurriculumId ? "Current Curriculum" : (formData.curriculumId ? "Selected Curriculum" : "Pending Selection")}
                        </Badge>
                    )}
                 </div>

                <div className="grid gap-2">
                    <Label>{t('lesson.title')} <span className="text-destructive">*</span></Label>
                    <Input 
                        value={formData.title} 
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        placeholder="e.g. Introduction to Physics"
                        onKeyDown={(e) => { if(e.key === 'Enter') e.preventDefault() }}
                    />
                </div>
                
                <div className="grid gap-2">
                    <Label>{t('common.descriptionPlaceholder')}</Label>
                    <Input 
                        value={formData.description} 
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        placeholder="Short summary of the lesson"
                        onKeyDown={(e) => { if(e.key === 'Enter') e.preventDefault() }}
                    />
                </div>

                <div className="grid gap-2">
                    <Label>{t('lesson.content')}</Label>
                    <Textarea 
                        value={formData.content} 
                        onChange={e => setFormData({...formData, content: e.target.value})}
                        className="h-24 font-mono text-sm resize-none" 
                        placeholder="<p>Lesson content goes here...</p>" 
                    />
                </div>

                {!isEditing && (
                    <div className="flex justify-end pt-2">
                        <Button 
                            type="button" 
                            onClick={handleAddToQueue} 
                            variant="secondary" 
                            size="sm" 
                            className="gap-2"
                            disabled={!formData.title}
                        >
                            <Plus className="h-4 w-4" /> Add to Batch
                        </Button>
                    </div>
                )}
            </div>

            {!isEditing && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <Label className="text-muted-foreground">Queue ({queue.length})</Label>
                        {queue.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => setQueue([])} className="h-auto px-2 text-xs" type="button">
                                Clear All
                            </Button>
                        )}
                    </div>
                    
                    <ScrollArea className="h-[150px] border rounded-md bg-muted/10">
                         {queue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4 opacity-70">
                                <Layers className="h-8 w-8 mb-2 opacity-20" />
                                <p>Add lessons above to build your list.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/50">
                                {queue.map((q, i) => (
                                    <div key={q.id} className="flex items-center justify-between p-3 text-sm bg-card/50 hover:bg-card transition-colors">
                                        <div className="grid gap-0.5">
                                            <div className="font-medium flex items-center gap-2">
                                                <Badge variant="secondary" className="font-mono text-[10px] px-1">#{i+1}</Badge>
                                                {q.title}
                                            </div>
                                            <div className="text-muted-foreground text-xs line-clamp-1 pl-7">
                                                {q.description || "No description"}
                                            </div>
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleRemoveFromQueue(q.id)}
                                            type="button"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            )}
        </div>
    </EntityDialog>
  )
}