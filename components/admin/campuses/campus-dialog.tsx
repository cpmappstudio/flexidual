"use client"

import { useState, useEffect } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin, Plus, Edit, Hash, Building2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { EntityDialog } from "@/components/ui/entity-dialog"

type CampusDialogProps = {
    trigger?: React.ReactNode
    open?: boolean 
    onOpenChange?: (open: boolean) => void
} & (
    | { campus: Doc<"campuses">; parentInstitution?: never }
    | {
        campus?: undefined
        parentInstitution: Pick<Doc<"schools">, "_id" | "name">
    }
)

export function CampusDialog(props: CampusDialogProps) {
    const { trigger, open, onOpenChange } = props
    const isEditing = !!props.campus
    const t = useTranslations("settings.campuses")

    const createCampus = useMutation(api.campuses.create)
    const updateCampus = useMutation(api.campuses.update)

    const [isOpen, setIsOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isAutoSlug, setIsAutoSlug] = useState(!isEditing)
    
    const [formData, setFormData] = useState({
        name: "",
        slug: "",
        code: "",
        status: "active",
    })

    const effectiveOpen = open !== undefined ? open : isOpen
    const handleOpenChange = onOpenChange || setIsOpen

    useEffect(() => {
        if (effectiveOpen) {
            if (props.campus) {
                setFormData({
                    name: props.campus.name,
                    slug: props.campus.slug,
                    code: props.campus.code || "",
                    status: props.campus.isActive ? "active" : "inactive",
                })
                setIsAutoSlug(false)
            } else {
                setFormData({ 
                    name: "", 
                    slug: "", 
                    code: "",
                    status: "active" 
                })
                setIsAutoSlug(true)
            }
        }
    }, [effectiveOpen, props.campus])

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
        setIsSubmitting(true)

        try {
            if (props.campus) {
                await updateCampus({
                    id: props.campus._id,
                    name: formData.name,
                    slug: formData.slug,
                    code: formData.code || undefined,
                    isActive: formData.status === "active",
                })
                toast.success(t("updated"))
            } else {
                await createCampus({
                    schoolId: props.parentInstitution._id,
                    name: formData.name,
                    slug: formData.slug,
                    code: formData.code || undefined,
                })
                toast.success(t("created"))
            }
            handleOpenChange(false)
        } catch (error) {
            toast.error((error as Error).message || t("saveError"))
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
            <Plus className="h-4 w-4" /> {t("add")}
        </Button>
    )

    return (
        <EntityDialog
            open={effectiveOpen}
            onOpenChange={handleOpenChange}
            trigger={trigger === undefined ? defaultTrigger : trigger}
            title={isEditing ? t("editTitle") : t("createTitle")}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            submitLabel={isEditing ? t("save") : t("create")}
        >
            <div className="grid gap-6 py-2">
                
                {!props.campus && (
                    <div className="grid gap-2">
                        <Label>{t("institution")}</Label>
                        <div className="flex items-center gap-2 text-sm">
                            <Building2 className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 truncate font-medium">
                                {props.parentInstitution.name}
                            </span>
                        </div>
                    </div>
                )}

                <div className="grid gap-2">
                    <Label htmlFor="name">{t("name")}</Label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            id="name" 
                            placeholder={t("namePlaceholder")}
                            value={formData.name}
                            onChange={handleNameChange}
                            className="pl-9"
                            minLength={2}
                            required 
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="slug">{t("identifier")}</Label>
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
                        <Label htmlFor="code">{t("code")}</Label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                id="code" 
                                placeholder={t("codePlaceholder")}
                                value={formData.code}
                                onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                                className="pl-9"
                            />
                        </div>
                    </div>
                </div>

                {isEditing && (
                    <div className="grid gap-2">
                        <Label htmlFor="status">{t("status")}</Label>
                        <Select 
                            value={formData.status}
                            onValueChange={(v) => setFormData({...formData, status: v})}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active">{t("active")}</SelectItem>
                                <SelectItem value="inactive">{t("inactive")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        </EntityDialog>
    )
}
