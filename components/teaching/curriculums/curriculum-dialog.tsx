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

interface CurriculumDialogProps {
  curriculum?: Doc<"curriculums">
}

export function CurriculumDialog({ curriculum }: CurriculumDialogProps) {
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
        toast.success("Curriculum updated")
      } else {
        await create({
          title: formData.get("title") as string,
          code: formData.get("code") as string,
          description: formData.get("description") as string,
        })
        toast.success("Curriculum created")
      }
      setIsOpen(false)
    } catch (error) {
      toast.error("Operation failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!curriculum) return
    if (!confirm("Delete this curriculum? All associated lessons will be deleted.")) return
    try {
      await remove({ id: curriculum._id })
      toast.success("Curriculum deleted")
      setIsOpen(false)
    } catch {
      toast.error("Failed to delete")
    }
  }

  const trigger = isEditing ? (
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <Edit className="h-4 w-4 text-muted-foreground" />
    </Button>
  ) : (
    <Button className="gap-2">
      <Plus className="h-4 w-4" /> Add Curriculum
    </Button>
  )

  return (
    <EntityDialog
      trigger={trigger}
      title={isEditing ? "Edit Curriculum" : "New Curriculum"}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? "Save" : "Create"}
      open={isOpen}
      onOpenChange={setIsOpen}
      isSubmitting={isSubmitting}
      leftActions={isEditing ? (
        <Button type="button" variant="destructive" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </Button>
      ) : undefined}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>Title</Label>
          <Input name="title" defaultValue={curriculum?.title} required />
        </div>
        <div className="grid gap-2">
          <Label>Code (Optional)</Label>
          <Input name="code" defaultValue={curriculum?.code} placeholder="e.g. MATH-101" />
        </div>
        <div className="grid gap-2">
          <Label>Description</Label>
          <Textarea name="description" defaultValue={curriculum?.description} />
        </div>
      </div>
    </EntityDialog>
  )
}