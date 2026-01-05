"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EntityDialog } from "@/components/ui/entity-dialog"
import { Plus, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

interface CurriculumDialogProps {
  curriculum?: Doc<"curriculums">
}

export function CurriculumDialog({ curriculum }: CurriculumDialogProps) {
  const t = useTranslations()
  const isEditing = !!curriculum
  const create = useMutation(api.curriculums.create)
  const update = useMutation(api.curriculums.update)
  const remove = useMutation(api.curriculums.remove)

  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    const formData = new FormData(event.currentTarget)

    try {
      if (isEditing && curriculum) {
        await update({
          id: curriculum._id,
          title: formData.get("title") as string,
          code: formData.get("code") as string,
          description: formData.get("description") as string,
        })
        toast.success(t('curriculum.updated'))
      } else {
        await create({
          title: formData.get("title") as string,
          code: formData.get("code") as string,
          description: formData.get("description") as string,
        })
        toast.success(t('curriculum.created'))
      }
      setIsOpen(false)
    } catch (error) {
      toast.error(t('errors.operationFailed'))
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
    <EntityDialog
      trigger={trigger}
      title={isEditing ? t('curriculum.edit') : t('curriculum.new')}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? t('common.save') : t('common.create')}
      open={isOpen}
      onOpenChange={setIsOpen}
      isSubmitting={isSubmitting}
      leftActions={isEditing ? (
        <Button type="button" variant="destructive" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete')}
        </Button>
      ) : undefined}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>{t('curriculum.title')}</Label>
          <Input name="title" defaultValue={curriculum?.title} required />
        </div>
        <div className="grid gap-2">
          <Label>{t('curriculum.code')}</Label>
          <Input name="code" defaultValue={curriculum?.code} placeholder="e.g. MATH-101" />
        </div>
        <div className="grid gap-2">
          <Label>{t('curriculum.description')}</Label>
          <Textarea name="description" defaultValue={curriculum?.description} />
        </div>
      </div>
    </EntityDialog>
  )
}