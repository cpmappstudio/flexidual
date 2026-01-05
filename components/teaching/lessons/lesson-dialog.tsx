"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

const formSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  content: z.string().optional(),
})

interface LessonDialogProps {
  curriculumId: Id<"curriculums">
  lesson?: Doc<"lessons">
}

export function LessonDialog({ curriculumId, lesson }: LessonDialogProps) {
  const t = useTranslations()
  const isEditing = !!lesson
  const [open, setOpen] = useState(false)
  
  const create = useMutation(api.lessons.create)
  const update = useMutation(api.lessons.update)
  const remove = useMutation(api.lessons.remove)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: lesson?.title || "",
      description: lesson?.description || "",
      content: lesson?.content || "",
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      if (isEditing && lesson) {
        await update({
          id: lesson._id,
          ...values,
        })
        toast.success(t('lesson.updated'))
      } else {
        await create({
          curriculumId,
          ...values,
        })
        toast.success(t('lesson.created'))
        form.reset()
      }
      setOpen(false)
    } catch (error) {
      toast.error(t('errors.operationFailed'))
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
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t('common.add')} {t('navigation.lessons')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('lesson.edit') : t('lesson.new')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('lesson.title')}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('lesson.description')}</FormLabel>
                  <FormControl><Input {...field} placeholder={t('lesson.description')} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('lesson.content')}</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      className="h-48 font-mono text-sm" 
                      placeholder="<p>Lesson content goes here...</p>" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:justify-between">
              {isEditing && (
                <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete')} {t('navigation.lessons')}
                </Button>
              )}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}