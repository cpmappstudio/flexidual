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
        toast.success("Lesson updated")
      } else {
        await create({
          curriculumId,
          ...values,
        })
        toast.success("Lesson created")
        form.reset()
      }
      setOpen(false)
    } catch (error) {
      toast.error("Failed to save lesson")
    }
  }

  const handleDelete = async () => {
    if (!lesson || !confirm("Delete this lesson permanently?")) return
    try {
      await remove({ id: lesson._id })
      toast.success("Lesson deleted")
      setOpen(false)
    } catch {
      toast.error("Failed to delete lesson")
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
            Add Lesson
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Lesson" : "Add New Lesson"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lesson Title</FormLabel>
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
                  <FormLabel>Short Description</FormLabel>
                  <FormControl><Input {...field} placeholder="Brief summary of what this lesson covers" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content (HTML/Text)</FormLabel>
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
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Lesson
                </Button>
              )}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Create Lesson"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}