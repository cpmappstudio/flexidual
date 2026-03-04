"use client"

import { useState, useEffect } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, Plus, Edit, Link as LinkIcon } from "lucide-react"
import { toast } from "sonner"
import { EntityDialog } from "@/components/ui/entity-dialog"

interface SchoolDialogProps {
    school?: Doc<"schools">
    trigger?: React.ReactNode
    open?: boolean 
    onOpenChange?: (open: boolean) => void
}

export function SchoolDialog({ school, trigger, open, onOpenChange }: SchoolDialogProps) {
    const isEditing = !!school
    
    const createSchool = useMutation(api.schools.create)
    const updateSchool = useMutation(api.schools.update)

    const [isOpen, setIsOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isAutoSlug, setIsAutoSlug] = useState(!isEditing)
    
    const [formData, setFormData] = useState({
        name: "",
        slug: "",
        status: "active",
    })

    const effectiveOpen = open !== undefined ? open : isOpen
    const handleOpenChange = onOpenChange || setIsOpen

    useEffect(() => {
        if (effectiveOpen) {
            if (school) {
                setFormData({
                    name: school.name,
                    slug: school.slug,
                    status: school.isActive ? "active" : "inactive",
                })
                setIsAutoSlug(false)
            } else {
                setFormData({ name: "", slug: "", status: "active" })
                setIsAutoSlug(true)
            }
        }
    }, [effectiveOpen, school])

    // Auto-generate slug when typing the name
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newName = e.target.value
        setFormData(prev => {
            const updates = { ...prev, name: newName } 
            if (isAutoSlug) {
                updates.slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
            }
            return updates
        })
    }

    const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsAutoSlug(false) // User took manual control
        setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            if (isEditing && school) {
                await updateSchool({
                    id: school._id,
                    name: formData.name,
                    slug: formData.slug,
                    isActive: formData.status === "active",
                })
                toast.success("School updated successfully")
            } else {
                await createSchool({
                    name: formData.name,
                    slug: formData.slug,
                })
                toast.success("School created successfully")
            }
            handleOpenChange(false)
        } catch (error) {
            toast.error((error as Error).message || "An error occurred")
        } finally {
            setIsSubmitting(false)
        }
    }

    const defaultTrigger = isEditing ? (
        <Button variant="ghost" size="icon" type="button">
            <Edit className="h-4 w-4 text-muted-foreground" />
        </Button>
    ) : (
        <Button className="gap-2" type="button">
            <Plus className="h-4 w-4" /> Add School
        </Button>
    )

    return (
        <EntityDialog
            open={effectiveOpen}
            onOpenChange={handleOpenChange}
            trigger={trigger || defaultTrigger}
            title={isEditing ? "Edit School" : "Create New School"}
            description={isEditing ? "Update the school's core details." : "Register a new educational network or district."}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            submitLabel={isEditing ? "Save Changes" : "Create School"}
        >
            <div className="grid gap-6 py-2">
                <div className="grid gap-2">
                    <Label htmlFor="name">School Name</Label>
                    <div className="relative">
                        <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            id="name" 
                            placeholder="e.g. Boston Public Schools"
                            value={formData.name}
                            onChange={handleNameChange}
                            className="pl-9"
                            required 
                        />
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="slug">URL Slug</Label>
                    <div className="relative">
                        <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            id="slug" 
                            placeholder="e.g. boston-public"
                            value={formData.slug}
                            onChange={handleSlugChange}
                            className="pl-9"
                            required 
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        This is the unique identifier used in the URL: <span className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">/{formData.slug || "slug"}</span>
                    </p>
                </div>

                {isEditing && (
                    <div className="grid gap-2">
                        <Label htmlFor="status">Status</Label>
                        <Select 
                            value={formData.status}
                            onValueChange={(v) => setFormData({...formData, status: v})}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        </EntityDialog>
    )
}