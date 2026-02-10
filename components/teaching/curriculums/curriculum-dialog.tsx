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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Plus, Edit, Trash2, X, BookOpen, Layers } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { EntityDialog } from "@/components/ui/entity-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { CurriculumLessonList } from "./curriculum-lesson-list"

interface CurriculumDialogProps {
  curriculum?: Doc<"curriculums">
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type PendingCurriculum = {
    id: string
    title: string
    code: string
    description: string
}

export function CurriculumDialog({ 
    curriculum, 
    trigger, 
    open: controlledOpen, 
    onOpenChange: controlledOnOpenChange 
}: CurriculumDialogProps) {
  const t = useTranslations()
  const isEditing = !!curriculum
  
  const createBatch = useMutation(api.curriculums.createBatch)
  const update = useMutation(api.curriculums.update)
  const remove = useMutation(api.curriculums.remove)

  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = controlledOnOpenChange || setInternalOpen
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [queue, setQueue] = useState<PendingCurriculum[]>([])
  
  const [formData, setFormData] = useState({
      title: "",
      code: "",
      description: "",
      isActive: true
  })

  useEffect(() => {
    if (isOpen) {
        if (isEditing && curriculum) {
            setFormData({
                title: curriculum.title,
                code: curriculum.code || "",
                description: curriculum.description || "",
                isActive: curriculum.isActive
            })
        } else {
            setQueue([])
            setFormData({ 
                title: "", 
                code: "", 
                description: "", 
                isActive: true 
            })
        }
    }
  }, [isOpen, isEditing, curriculum])

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
    setFormData({ title: "", code: "", description: "", isActive: true })
  }

  const handleRemoveFromQueue = (id: string) => {
    setQueue(queue.filter(q => q.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
        if (isEditing && curriculum) {
            await update({
                id: curriculum._id,
                title: formData.title,
                code: formData.code || undefined,
                description: formData.description || undefined,
                isActive: formData.isActive, 
            })
            toast.success(t('curriculum.updated'))
            setIsOpen(false)
        } else {
            const finalQueue = [...queue]
            if (finalQueue.length === 0 && formData.title) {
                finalQueue.push({
                    id: "temp",
                    title: formData.title,
                    code: formData.code,
                    description: formData.description
                })
            }

            if (finalQueue.length === 0) return

            await createBatch({
                curriculums: finalQueue.map(q => ({
                    title: q.title,
                    code: q.code || undefined,
                    description: q.description || undefined
                }))
            })
            
            toast.success(`${finalQueue.length} curriculums created`)
            setIsOpen(false)
        }
    } catch (error) {
        toast.error(t('errors.operationFailed') + (error instanceof Error ? `: ${error.message}` : ""))
    } finally {
        setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!curriculum || !confirm(t('curriculum.deleteConfirm'))) return
    try {
      await remove({ id: curriculum._id })
      toast.success(t('curriculum.deleted'))
      setIsOpen(false)
    } catch {
      toast.error(t('errors.operationFailed'))
    }
  }

  const dialogTitle = isEditing ? t('curriculum.edit') : t('curriculum.createCurriculum') + 's'
  const dialogDesc = isEditing ? t('navigation.curriculumEditDescription') : t('curriculum.addCurriculums')

  const createLabel = queue.length > 0 
    ? t('common.createAllNumber', { count: queue.length }) 
    : (formData.title ? t('curriculum.createCurriculum') : t('common.create'))

  return (
    <EntityDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        trigger={trigger || (isEditing ? (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" type="button">
                <Edit className="h-4 w-4 text-muted-foreground" />
            </Button>
        ) : (
            <Button className="gap-2" type="button">
              <Plus className="h-4 w-4" /> {t('common.add')} {t('navigation.curriculums')}
            </Button>
        ))}
        title={dialogTitle}
        description={dialogDesc}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitLabel={isEditing ? t('common.save') : createLabel}
        maxWidth={isEditing ? "sm:max-w-[800px]" : "sm:max-w-[700px]"}
        leftActions={isEditing && (
            <Button type="button" variant="destructive" onClick={handleDelete} className="mr-auto">
                <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete')}
            </Button>
        )}
    >
        {isEditing ? (
            <Tabs defaultValue="details" className="w-full h-full flex flex-col">
                <TabsList className="w-full justify-start mb-4">
                    <TabsTrigger value="details" className="gap-2"><BookOpen className="h-4 w-4" /> {t('common.details')}</TabsTrigger>
                    <TabsTrigger value="lessons" className="gap-2"><Layers className="h-4 w-4" /> {t('navigation.lessons')}</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="flex-1 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>{t('curriculum.title')}</Label>
                            <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
                        </div>
                        <div className="grid gap-2">
                            <Label>{t('curriculum.code')}</Label>
                            <Input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div className="grid gap-2">
                            <Label>{t('common.status')}</Label>
                            <Select 
                                value={formData.isActive ? "active" : "inactive"} 
                                onValueChange={(v) => setFormData({...formData, isActive: v === "active"})}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">{t('common.active')}</SelectItem>
                                    <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {/* Empty spacer or other fields can go here */}
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('common.description')}</Label>
                        <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="h-32 resize-none" />
                    </div>
                </TabsContent>

                <TabsContent value="lessons" className="flex-1 min-h-[400px]">
                     {curriculum && <CurriculumLessonList curriculumId={curriculum._id} />}
                </TabsContent>
            </Tabs>
        ) : (
            <div className="space-y-6">
                <div className="grid gap-4 p-4 border rounded-lg bg-muted/30">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 grid gap-2">
                            <Label>{t('curriculum.title')}</Label>
                            <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="e.g. Science 101" />
                        </div>
                        <div className="grid gap-2">
                            <Label>{t('curriculum.code')}</Label>
                            <Input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} placeholder="SCI-101" />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label>{t('common.description')}</Label>
                        <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="h-20 resize-none" placeholder={t('curriculum.descriptionInputPlaceholder')} />
                    </div>
                    <div className="flex justify-end">
                        <Button type="button" onClick={handleAddToQueue} variant="secondary" size="sm" className="gap-2">
                            <Plus className="h-4 w-4" /> {t('common.addToQueue')}
                        </Button>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>{t('curriculum.curriculumsToCreate', { count: queue.length })}</Label>
                        {queue.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => setQueue([])} type="button">{t('common.clearAll')}</Button>
                        )}
                    </div>
                    <ScrollArea className="h-[200px] border rounded-md bg-background">
                         {queue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
                                <BookOpen className="h-8 w-8 mb-2 opacity-20" />
                                <p>{t('curriculum.addBatchCurriculumsInstruction')}</p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {queue.map((q) => (
                                    <div key={q.id} className="flex items-center justify-between p-3 text-sm hover:bg-muted/50">
                                        <div className="grid gap-0.5">
                                            <div className="font-medium flex items-center gap-2">
                                                {q.title}
                                                {q.code && <Badge variant="outline" className="text-[10px] h-5">{q.code}</Badge>}
                                            </div>
                                            <div className="text-muted-foreground text-xs line-clamp-1">{q.description}</div>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveFromQueue(q.id)} type="button">
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </div>
        )}
    </EntityDialog>
  )
}