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
import { UserPlus, Edit, Trash2, /*ShieldCheck, GraduationCap, School */ } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { UserRole } from "@/convex/types"

interface UserDialogProps {
    user?: {
        _id: Id<"users">
        firstName?: string
        lastName?: string
        email: string
        role: string
        isActive?: boolean
    }
    defaultRole?: UserRole
    allowedRoles?: UserRole[] // If provided, limits the dropdown options
}

export function UserDialog({ user, defaultRole, allowedRoles }: UserDialogProps) {
    const t = useTranslations()
    const isEditing = !!user
    
    // API Hooks
    const createUser = useAction(api.users.createUserWithClerk)
    const updateUser = useAction(api.users.updateUserWithClerk)
    const deleteUser = useAction(api.users.deleteUserWithClerk)

    const [isOpen, setIsOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Determine available roles
    const allRoles: UserRole[] = ["student", "teacher", "tutor", "admin", "superadmin"]
    const rolesToDisplay = allowedRoles || allRoles
    const effectiveDefaultRole = user?.role as UserRole || defaultRole || rolesToDisplay[0]

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsSubmitting(true)
        const formData = new FormData(event.currentTarget)

        try {
            const role = formData.get("role") as UserRole
            
            if (isEditing && user) {
                await updateUser({
                    userId: user._id,
                    updates: {
                        firstName: formData.get("firstName") as string,
                        lastName: formData.get("lastName") as string,
                        email: formData.get("email") as string,
                        role: role, 
                        isActive: formData.get("status") === "active",
                        avatarStorageId: null // Handled separately if needed
                    }
                })
                toast.success(t('common.save'))
            } else {
                await createUser({
                    firstName: formData.get("firstName") as string,
                    lastName: formData.get("lastName") as string,
                    email: formData.get("email") as string,
                    role: role,
                })
                toast.success(t('common.create'))
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
        if (!user) return
        if (!confirm(t('errors.deleteConfirm'))) return
        
        try {
            await deleteUser({ userId: user._id })
            toast.success(t('common.delete'))
            setIsOpen(false)
        } catch (error) {
            toast.error(t('errors.operationFailed') + ': ' + (error as Error).message)
        }
    }

    // Dynamic Trigger Button
    const trigger = isEditing ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{t('common.edit')}</span>
        </Button>
    ) : (
        <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            {/* Show specific text if only one role allowed, e.g. "Add Teacher" */}
            {allowedRoles?.length && allowedRoles?.length >= 1 
                ? `${t('common.add')} ${t(`navigation.${allowedRoles[0]}s`)}` // Naive pluralization fallback
                : t('common.newUsers') // Fallback to "Add New..."
            }
        </Button>
    )

    return (
        <EntityDialog
            trigger={trigger}
            title={isEditing ? t('common.edit') : t('common.create')}
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
                            defaultValue={user?.firstName} 
                            required 
                        />
                    </div>
                    <div className="grid gap-3">
                        <Label htmlFor="lastName">{t('teacher.lastName')}</Label>
                        <Input 
                            id="lastName" 
                            name="lastName" 
                            defaultValue={user?.lastName} 
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
                        defaultValue={user?.email} 
                        required 
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-3">
                        <Label htmlFor="role">{t('teacher.role')}</Label>
                        
                        {/* Lock role if editing OR if allowedRoles is restricted to 1 */}
                        {rolesToDisplay.length === 1 ? (
                            <>
                                <Input 
                                    value={t(`navigation.${rolesToDisplay[0]}s`)} // Display name
                                    disabled 
                                    className="bg-muted"
                                />
                                <input type="hidden" name="role" value={rolesToDisplay[0]} />
                            </>
                        ) : (
                            <Select name="role" defaultValue={effectiveDefaultRole}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('teacher.selectRole')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {rolesToDisplay.map(role => (
                                        <SelectItem key={role} value={role}>
                                            {t(`navigation.${role}s`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    
                    {isEditing && (
                        <div className="grid gap-3">
                            <Label htmlFor="status">{t('common.status')}</Label>
                            <Select name="status" defaultValue={user?.isActive ? "active" : "inactive"}>
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