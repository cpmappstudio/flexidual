"use client"

import { useState } from "react"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { EntityDialog } from "@/components/ui/entity-dialog"
import { UserPlus, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

interface TeacherDialogProps {
    teacher?: {
        _id: Id<"users">
        firstName?: string
        lastName?: string
        email: string
        role: "teacher" | "admin"
        isActive?: boolean
    }
}

export function TeacherDialog({ teacher }: TeacherDialogProps) {
    const t = useTranslations()
    const isEditing = !!teacher
    
    // API Hooks
    const createUser = useAction(api.users.createUserWithClerk)
    const updateUser = useAction(api.users.updateUserWithClerk)
    const deleteUser = useAction(api.users.deleteUserWithClerk)

    const [isOpen, setIsOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsSubmitting(true)
        const formData = new FormData(event.currentTarget)

        try {
            if (isEditing && teacher) {
                await updateUser({
                    userId: teacher._id,
                    updates: {
                        firstName: formData.get("firstName") as string,
                        lastName: formData.get("lastName") as string,
                        email: formData.get("email") as string,
                        role: formData.get("role") as "teacher" | "admin", 
                        isActive: formData.get("status") === "active",
                        avatarStorageId: null
                    }
                })
                toast.success(t('teacher.updated'))
            } else {
                await createUser({
                    firstName: formData.get("firstName") as string,
                    lastName: formData.get("lastName") as string,
                    email: formData.get("email") as string,
                    role: "teacher",
                })
                toast.success(t('teacher.created'))
            }
            setIsOpen(false)
        } catch (error) {
            console.error(error)
            toast.error(t('errors.operationFailed'))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!teacher) return
        if (!confirm(t('teacher.deleteConfirm'))) return
        
        try {
            await deleteUser({ userId: teacher._id })
            toast.success(t('teacher.deleted'))
            setIsOpen(false)
        } catch (error) {
            toast.error(t('errors.operationFailed') + ': ' + (error as Error).message)
        }
    }

    // Trigger Button Logic
    const trigger = isEditing ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{t('common.edit')}</span>
        </Button>
    ) : (
        <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            {t('teacher.new')}
        </Button>
    )

    return (
        <EntityDialog
            trigger={trigger}
            title={isEditing ? t('teacher.edit') : t('teacher.new')}
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
            <div className="grid gap-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-3">
                        <Label htmlFor="firstName">{t('teacher.firstName')}</Label>
                        <Input 
                            id="firstName" 
                            name="firstName" 
                            defaultValue={teacher?.firstName} 
                            required 
                        />
                    </div>
                    <div className="grid gap-3">
                        <Label htmlFor="lastName">{t('teacher.lastName')}</Label>
                        <Input 
                            id="lastName" 
                            name="lastName" 
                            defaultValue={teacher?.lastName} 
                            required 
                        />
                    </div>
                </div>

                <div className="grid gap-3">
                    <Label htmlFor="email">{t('teacher.email')}</Label>
                    <Input 
                        id="email" 
                        name="email" 
                        type="email" 
                        defaultValue={teacher?.email} 
                        required 
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-3">
                        <Label htmlFor="role">{t('teacher.role')}</Label>
                        <Select name="role" defaultValue={teacher?.role || "teacher"}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('teacher.selectRole')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="teacher">{t('navigation.teachers')}</SelectItem>
                                <SelectItem value="admin">{t('navigation.admin')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    {isEditing && (
                        <div className="grid gap-3">
                            <Label htmlFor="status">{t('common.status')}</Label>
                            <Select name="status" defaultValue={teacher?.isActive ? "active" : "inactive"}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('common.selectStatus')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">{t('common.active')}</SelectItem>
                                    <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </div>
        </EntityDialog>
    )
}