"use client"

import { useState, useEffect } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog"
import { Loader2, Plus, Pencil, Trash2, X, BookOpen } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { ScrollArea } from "@/components/ui/scroll-area"

interface LessonDialogProps {
  curriculumId: Id<"curriculums">
  lesson?: Doc<"lessons">
}

type PendingLesson = {
    id: string
    title: string
    description: string
    content: string
}

export function LessonDialog({ curriculumId, lesson }: LessonDialogProps) {
  const t = useTranslations()
  const isEditing = !!lesson
  
  // API Hooks
  const createBatch = useMutation(api.lessons.createBatch)
  const update = useMutation(api.lessons.update)
  const remove = useMutation(api.lessons.remove)

  // State
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Batch Mode State
  const [queue, setQueue] = useState<PendingLesson[]>([])
  
  // Form Data
  const [formData, setFormData] = useState({
      title: "",
      description: "",
      content: ""
  })

  // Init/Reset
  useEffect(() => {
    if (open) {
        if (isEditing && lesson) {
            setFormData({
                title: lesson.title,
                description: lesson.description || "",
                content: lesson.content || ""
            })
        } else {
            setQueue([])
            setFormData({ title: "", description: "", content: "" })
        }
    }
  }, [open, isEditing, lesson])

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
    // Reset form but keep content empty/description empty for speed
    setFormData({ title: "", description: "", content: "" })
    
    // Focus title input again? (Requires ref, skipping for simplicity)
  }

  const handleRemoveFromQueue = (id: string) => {
    setQueue(queue.filter(q => q.id !== id))
  }

  const handleBatchSubmit = async () => {
    if (queue.length === 0) return
    setIsSubmitting(true)

    try {
        const results = await createBatch({
            curriculumId,
            lessons: queue.map(q => ({
                title: q.title,
                description: q.description || undefined,
                content: q.content || undefined
            }))
        })

        const failures = results.filter(r => r.status === "error")
        const successes = results.filter(r => r.status === "success").length

        if (failures.length === 0) {
            toast.success(`${successes} lessons created`)
            setOpen(false)
        } else {
            toast.warning(`${successes} created, ${failures.length} failed`)
        }
    } catch (error) {
        toast.error(t('errors.operationFailed'))
    } finally {
        setIsSubmitting(false)
    }
  }

  // --- SINGLE EDIT HANDLER ---

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lesson) return
    setIsSubmitting(true)

    try {
        await update({
            id: lesson._id,
            title: formData.title,
            description: formData.description || undefined,
            content: formData.content || undefined,
        })
        toast.success(t('lesson.updated'))
        setOpen(false)
    } catch (error) {
        toast.error(t('errors.operationFailed'))
    } finally {
        setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!lesson || !confirm(t('lesson.deleteConfirm'))) return
    try {
      await remove({ id: lesson._id })
      toast.success(t('lesson.deleted'))
      setOpen(false)
    } catch {
      toast.error(t('errors.operationFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditing ? (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
        ) : (
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            {t('common.add')} {t('navigation.lessons')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={isEditing ? "sm:max-w-[600px]" : "sm:max-w-[700px]"}>
        <DialogHeader>
          <DialogTitle>{isEditing ? t('lesson.edit') : "Add Lessons"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update lesson details and content." : "Add one or more lessons to this curriculum."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
             {/* INPUT FORM */}
             <form 
                onSubmit={isEditing ? handleEditSubmit : handleAddToQueue}
                className="grid gap-4 p-4 border rounded-lg bg-muted/30"
            >
                <div className="grid gap-2">
                    <Label>{t('lesson.title')}</Label>
                    <Input 
                        value={formData.title} 
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        required 
                        placeholder="e.g. Introduction to Physics"
                    />
                </div>
                
                <div className="grid gap-2">
                    <Label>{t('lesson.description')}</Label>
                    <Input 
                        value={formData.description} 
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        placeholder="Short summary of the lesson"
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
                    <div className="flex justify-end">
                        <Button type="submit" variant="secondary" size="sm" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Add to Queue
                        </Button>
                    </div>
                )}
            </form>

            {/* QUEUE LIST (Create Mode Only) */}
            {!isEditing && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Lessons to Create ({queue.length})</Label>
                        {queue.length > 0 && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-muted-foreground h-auto p-0"
                                onClick={() => setQueue([])}
                            >
                                Clear All
                            </Button>
                        )}
                    </div>

                    <ScrollArea className="h-[150px] border rounded-md bg-background">
                         {queue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
                                <BookOpen className="h-8 w-8 mb-2 opacity-20" />
                                <p>Add items above to build your list.</p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {queue.map((q, i) => (
                                    <div key={q.id} className="flex items-center justify-between p-3 text-sm hover:bg-muted/50">
                                        <div className="grid gap-0.5">
                                            <div className="font-medium flex items-center gap-2">
                                                <span className="text-muted-foreground font-mono text-xs">#{i+1}</span>
                                                {q.title}
                                            </div>
                                            <div className="text-muted-foreground text-xs line-clamp-1">
                                                {q.description}
                                            </div>
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleRemoveFromQueue(q.id)}
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

        <DialogFooter className="gap-2 sm:gap-0">
            {isEditing && (
                <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={handleDelete}
                    className="mr-auto"
                >
                    <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete')}
                </Button>
            )}
            
            <Button variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
            </Button>

            {isEditing ? (
                <Button 
                    onClick={handleEditSubmit} 
                    disabled={isSubmitting}
                >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('common.save')}
                </Button>
            ) : (
                <Button 
                    onClick={handleBatchSubmit} 
                    disabled={queue.length === 0 || isSubmitting}
                >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('common.create')} {queue.length > 0 && `(${queue.length})`}
                </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}