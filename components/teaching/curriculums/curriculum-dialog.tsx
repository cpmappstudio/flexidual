"use client"

import { useState, useEffect } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Edit, Trash2, X, Loader2, BookOpen } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

interface CurriculumDialogProps {
  curriculum?: Doc<"curriculums">
}

type PendingCurriculum = {
    id: string
    title: string
    code: string
    description: string
}

export function CurriculumDialog({ curriculum }: CurriculumDialogProps) {
  const t = useTranslations()
  const isEditing = !!curriculum
  
  // API Hooks
  const createBatch = useMutation(api.curriculums.createBatch)
  const update = useMutation(api.curriculums.update)
  const remove = useMutation(api.curriculums.remove)

  // State
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Batch Mode State
  const [queue, setQueue] = useState<PendingCurriculum[]>([])
  
  // Form Data
  const [formData, setFormData] = useState({
      title: "",
      code: "",
      description: ""
  })

  // Reset/Init
  useEffect(() => {
    if (isOpen) {
        if (isEditing && curriculum) {
            setFormData({
                title: curriculum.title,
                code: curriculum.code || "",
                description: curriculum.description || ""
            })
        } else {
            setQueue([])
            setFormData({ title: "", code: "", description: "" })
        }
    }
  }, [isOpen, isEditing, curriculum])

  // --- BATCH HANDLERS ---

  const handleAddToQueue = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title) return

    const newItem: PendingCurriculum = {
        id: Math.random().toString(36).substr(2, 9),
        title: formData.title,
        code: formData.code,
        description: formData.description
    }

    setQueue([...queue, newItem])
    setFormData({ title: "", code: "", description: "" })
  }

  const handleRemoveFromQueue = (id: string) => {
    setQueue(queue.filter(q => q.id !== id))
  }

  const handleBatchSubmit = async () => {
    if (queue.length === 0) return
    setIsSubmitting(true)

    try {
        const results = await createBatch({
            curriculums: queue.map(q => ({
                title: q.title,
                code: q.code || undefined,
                description: q.description || undefined
            }))
        })

        const failures = results.filter(r => r.status === "error")
        const successes = results.filter(r => r.status === "success").length

        if (failures.length === 0) {
            toast.success(`${successes} curriculums created`)
            setIsOpen(false)
        } else {
            toast.warning(`${successes} created, ${failures.length} failed`)
            // Ideally we'd keep failed ones in the queue, but for simplicity we close
            // You could log failures here: console.log(failures)
        }
    } catch (error) {
        toast.error(t('errors.operationFailed' + (error instanceof Error ? `: ${error.message}` : "")))
    } finally {
        setIsSubmitting(false)
    }
  }

  // --- SINGLE EDIT HANDLER ---

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!curriculum) return
    setIsSubmitting(true)

    try {
        await update({
            id: curriculum._id,
            title: formData.title,
            code: formData.code || undefined,
            description: formData.description || undefined,
        })
        toast.success(t('curriculum.updated'))
        setIsOpen(false)
    } catch (error) {
        toast.error(t('errors.operationFailed' + (error instanceof Error ? `: ${error.message}` : "")))
    } finally {
        setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!curriculum) return
    if (!confirm(t('curriculum.deleteConfirm'))) return
    try {
      await remove({ id: curriculum._id })
      toast.success(t('curriculum.deleted'))
      setIsOpen(false)
    } catch {
      toast.error(t('errors.operationFailed'))
    }
  }

  // Trigger Button
  const trigger = isEditing ? (
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <Edit className="h-4 w-4 text-muted-foreground" />
    </Button>
  ) : (
    <Button className="gap-2">
      <Plus className="h-4 w-4" /> {t('common.add')} {t('navigation.curriculums')}
    </Button>
  )

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className={isEditing ? "sm:max-w-[500px]" : "sm:max-w-[700px]"}>
        <DialogHeader>
            <DialogTitle>{isEditing ? t('curriculum.edit') : "Add Curriculums"}</DialogTitle>
            <DialogDescription>
                {isEditing ? "Update curriculum details." : "Add one or more curriculums to the platform."}
            </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
             {/* INPUT FORM */}
             <form 
                onSubmit={isEditing ? handleEditSubmit : handleAddToQueue}
                className="grid gap-4 p-4 border rounded-lg bg-muted/30"
            >
                <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 grid gap-2">
                        <Label>{t('curriculum.title')}</Label>
                        <Input 
                            value={formData.title} 
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            required 
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>{t('curriculum.code')}</Label>
                        <Input 
                            value={formData.code} 
                            onChange={e => setFormData({...formData, code: e.target.value})}
                            placeholder="e.g. MATH-101" 
                        />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label>{t('curriculum.description')}</Label>
                    <Textarea 
                        value={formData.description} 
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="h-20 resize-none"
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
                        <Label>Curriculums to Create ({queue.length})</Label>
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
                                {queue.map((q) => (
                                    <div key={q.id} className="flex items-center justify-between p-3 text-sm hover:bg-muted/50">
                                        <div className="grid gap-0.5">
                                            <div className="font-medium flex items-center gap-2">
                                                {q.title}
                                                {q.code && (
                                                    <Badge variant="outline" className="text-[10px] h-5">
                                                        {q.code}
                                                    </Badge>
                                                )}
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
            
            <Button variant="outline" onClick={() => setIsOpen(false)}>
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