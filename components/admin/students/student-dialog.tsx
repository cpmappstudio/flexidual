"use client"

import { useState } from "react"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EntityDialog } from "@/components/ui/entity-dialog"
import { UserPlus, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

interface StudentDialogProps {
    student?: {
        _id: Id<"users">
        firstName?: string
        lastName?: string
        email: string
        role: "student"
        isActive?: boolean
    }
}

export function StudentDialog({ student }: StudentDialogProps) {
    const t = useTranslations()
    const isEditing = !!student
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
            if (isEditing && student) {
                await updateUser({
                    userId: student._id,
                    updates: {
                        firstName: formData.get("firstName") as string,
                        lastName: formData.get("lastName") as string,
                        isActive: formData.get("status") === "active",
                        role: "student"
                    }
                })
                toast.success(t('student.updated'))
            } else {
                await createUser({
                    firstName: formData.get("firstName") as string,
                    lastName: formData.get("lastName") as string,
                    email: formData.get("email") as string,
                    role: "student",
                })
                toast.success(t('student.created'))
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
        if (!student || !confirm(t('student.deleteConfirm'))) return
        try {
            await deleteUser({ userId: student._id })
            toast.success(t('student.deleted'))
            setIsOpen(false)
        } catch (error) {
            toast.error(t('errors.operationFailed') + ': ' + (error as Error).message)
        }
    }

    const trigger = isEditing ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4 text-muted-foreground" />
        </Button>
    ) : (
        <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            {t('student.new')}
        </Button>
    )

    return (
        <EntityDialog
            trigger={trigger}
            title={isEditing ? t('student.edit') : t('student.new')}
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
                        <Label>{t('student.firstName')}</Label>
                        <Input name="firstName" defaultValue={student?.firstName} required />
                    </div>
                    <div className="grid gap-3">
                        <Label>{t('student.lastName')}</Label>
                        <Input name="lastName" defaultValue={student?.lastName} required />
                    </div>
                </div>
                <div className="grid gap-3">
                    <Label>{t('student.email')}</Label>
                    <Input name="email" type="email" defaultValue={student?.email} required />
                </div>
            </div>
        </EntityDialog>
    )
}