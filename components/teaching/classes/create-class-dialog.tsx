"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const formSchema = z.object({
  name: z.string().min(2, "Class name must be at least 2 characters"),
  curriculumId: z.string().min(1, "Please select a curriculum"),
})

export function CreateClassDialog() {
  const [open, setOpen] = useState(false)
  
  // 1. Fetch available curriculums (Templates)
  const curriculums = useQuery(api.curriculums.list, { includeInactive: false })
  const createClass = useMutation(api.classes.create)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      curriculumId: "",
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      // @ts-ignore - Convex ID typing
      await createClass({
        name: values.name,
        curriculumId: values.curriculumId as any, 
      })
      toast.success("Class created successfully")
      setOpen(false)
      form.reset()
    } catch (error) {
      toast.error("Failed to create class")
      console.error(error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Class
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Class</DialogTitle>
          <DialogDescription>
            Create a group of students that will follow a specific curriculum.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Science 101 - Fall 2024" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="curriculumId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Curriculum</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a curriculum" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {curriculums?.map((curr) => (
                        <SelectItem key={curr._id} value={curr._id}>
                          {curr.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Class
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}