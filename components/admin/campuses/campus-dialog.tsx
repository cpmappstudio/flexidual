"use client"

import { useState, useEffect } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id, Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin, Plus, Edit, Hash, Building2 } from "lucide-react"
import { toast } from "sonner"
import { EntityDialog } from "@/components/ui/entity-dialog"

interface CampusDialogProps {
    campus?: Doc<"campuses">
    defaultSchoolId?: Id<"schools">
    trigger?: React.ReactNode
    open?: boolean 
    onOpenChange?: (open: boolean) => void
}

export function CampusDialog({ campus, defaultSchoolId, trigger, open, onOpenChange }: CampusDialogProps) {
    const isEditing = !!campus
    
    const schools = useQuery(api.schools.list, { isActive: true })
    const createCampus = useMutation(api.campuses.create)
    const updateCampus = useMutation(api.campuses.update)

    const [isOpen, setIsOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isAutoSlug, setIsAutoSlug] = useState(!isEditing)
    
    const [formData, setFormData] = useState({
        name: "",
        slug: "",
        code: "",
        schoolId: defaultSchoolId || "",
        status: "active",
    })

    const effectiveOpen = open !== undefined ? open : isOpen
    const handleOpenChange = onOpenChange || setIsOpen

    useEffect(() => {
        if (effectiveOpen) {
            if (campus) {
                setFormData({
                    name: campus.name,
                    slug: campus.slug,
                    code: campus.code || "",
                    schoolId: campus.schoolId,
                    status: campus.isActive ? "active" : "inactive",
                })
                setIsAutoSlug(false)
            } else {
                setFormData({ 
                    name: "", 
                    slug: "", 
                    code: "",
                    schoolId: defaultSchoolId || (schools?.[0]?._id ?? ""), 
                    status: "active" 
                })
                setIsAutoSlug(true)
            }
        }
    }, [effectiveOpen, campus, defaultSchoolId, schools])

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.schoolId) {
            toast.error("Please select a parent school.")
            return
        }

        setIsSubmitting(true)

        try {
            if (isEditing && campus) {
                await updateCampus({
                    id: campus._id,
                    name: formData.name,
                    slug: formData.slug,
                    code: formData.code || undefined,
                    isActive: formData.status === "active",
                })
                toast.success("Campus updated successfully")
            } else {
                await createCampus({
                    schoolId: formData.schoolId as Id<"schools">,
                    name: formData.name,
                    slug: formData.slug,
                    code: formData.code || undefined,
                })
                toast.success("Campus created successfully")
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
            <Plus className="h-4 w-4" /> Add Campus
        </Button>
    )

    return (
        <EntityDialog
            open={effectiveOpen}
            onOpenChange={handleOpenChange}
            trigger={trigger || defaultTrigger}
            title={isEditing ? "Edit Campus" : "Create New Campus"}
            description={isEditing ? "Update campus details and settings." : "Add a new campus to a school network."}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            submitLabel={isEditing ? "Save Changes" : "Create Campus"}
        >
            <div className="grid gap-6 py-2">
                
                {!isEditing && (
                    <div className="grid gap-2">
                        <Label htmlFor="schoolId">Parent School</Label>
                        <Select 
                            value={formData.schoolId}
                            onValueChange={(v) => setFormData({...formData, schoolId: v})}
                            disabled={!!defaultSchoolId}
                        >
                            <SelectTrigger>
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                    <SelectValue placeholder="Select a school..." />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                {schools?.map(school => (
                                    <SelectItem key={school._id} value={school._id}>
                                        {school.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="grid gap-2">
                    <Label htmlFor="name">Campus Name</Label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            id="name" 
                            placeholder="e.g. North Campus"
                            value={formData.name}
                            onChange={handleNameChange}
                            className="pl-9"
                            required 
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="slug">URL Slug</Label>
                        <Input 
                            id="slug" 
                            placeholder="north-campus"
                            value={formData.slug}
                            onChange={(e) => {
                                setIsAutoSlug(false)
                                setFormData({...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})
                            }}
                            required 
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="code">Campus Code (Optional)</Label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                id="code" 
                                placeholder="e.g. NC-01"
                                value={formData.code}
                                onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                                className="pl-9"
                            />
                        </div>
                    </div>
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