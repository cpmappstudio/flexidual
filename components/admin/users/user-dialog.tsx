"use client"

import { useState, useEffect } from "react"
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
import { 
    UserPlus, 
    Edit, 
    Trash2, 
    Plus, 
    X,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations, useLocale } from "next-intl"
import { UserRole } from "@/convex/types"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { EntityDialog } from "@/components/ui/entity-dialog" // 1. Import Shared Component
import { useAlert } from "@/components/providers/alert-provider"
import { parseConvexError, getErrorMessage } from "@/lib/error-utils"
import { GRADE_VALUES } from "@/lib/types/academic"

interface UserDialogProps {
    user?: {
        _id: Id<"users">
        firstName?: string
        lastName?: string
        email: string
        role: string
        isActive?: boolean
        grade?: string
        school?: string
    }
    defaultRole?: UserRole
    allowedRoles?: UserRole[]
    trigger?: React.ReactNode
    open?: boolean 
    onOpenChange?: (open: boolean) => void
}

const ALL_ROLES: UserRole[] = ["student", "teacher", "tutor", "admin", "superadmin"]

type PendingUser = {
    id: string
    firstName: string
    lastName: string
    email: string
    role: UserRole
    grade?: string
    school?: string
}

export function UserDialog({ 
    user, 
    defaultRole, 
    allowedRoles, 
    trigger, 
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange
}: UserDialogProps) {
    const t = useTranslations()
    const locale = useLocale()
    const { showAlert } = useAlert()
    const isEditing = !!user
    
    // API Hooks
    const createUsers = useAction(api.users.createUsersWithClerk)
    const updateUser = useAction(api.users.updateUserWithClerk)
    const deleteUser = useAction(api.users.deleteUserWithClerk)

    // State
    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = controlledOpen !== undefined
    const isOpen = isControlled ? controlledOpen : internalOpen
    const setIsOpen = isControlled ? controlledOnOpenChange! : setInternalOpen
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [queue, setQueue] = useState<PendingUser[]>([])
    
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        role: defaultRole || "student" as UserRole,
        status: "active",
        grade: "",
        school: ""
    })

    const rolesToDisplay = allowedRoles || ALL_ROLES

    useEffect(() => {
        if (isOpen) {
            if (isEditing && user) {
                setFormData({
                    firstName: user.firstName || "",
                    lastName: user.lastName || "",
                    email: user.email,
                    role: user.role as UserRole,
                    status: user.isActive ? "active" : "inactive",
                    grade: user.grade || "",
                    school: user.school || ""
                })
            } else {
                setQueue([])
                setFormData({
                    firstName: "",
                    lastName: "",
                    email: "",
                    role: (defaultRole || rolesToDisplay[0]) as UserRole,
                    status: "active",
                    grade: "",
                    school: ""
                })
            }
        }
    }, [isOpen, user, isEditing, defaultRole, rolesToDisplay])

    // --- HANDLERS ---

    const handleAddToQueue = (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.email || !formData.firstName || !formData.lastName) return

        const newUser: PendingUser = {
            id: Math.random().toString(36).substr(2, 9),
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            role: formData.role,
            grade: formData.grade,
            school: formData.school
        }

        setQueue([...queue, newUser])
        
        setFormData(prev => ({
            ...prev,
            firstName: "",
            lastName: "",
            email: ""
        }))
    }

    const handleRemoveFromQueue = (id: string) => {
        setQueue(queue.filter(u => u.id !== id))
    }

    // This is the main submit handler called by EntityDialog footer button
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            if (isEditing && user) {
                // EDIT MODE
                await updateUser({
                    userId: user._id,
                    updates: {
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        email: formData.email,
                        role: formData.role, 
                        isActive: formData.status === "active",
                        grade: formData.role === "student" ? formData.grade : undefined,
                        school: formData.role === "student" ? formData.school : undefined,
                    }
                })
                toast.success(t('common.save'))
                setIsOpen(false)
            } else {
                // BATCH CREATE MODE
                // If queue is empty but form has data, treat as single create
                const finalQueue = [...queue]
                if (finalQueue.length === 0 && formData.email) {
                    finalQueue.push({
                        id: "temp",
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        email: formData.email,
                        role: formData.role,
                        grade: formData.grade,
                        school: formData.school
                    })
                }

                if (finalQueue.length === 0) return

                const results = await createUsers({
                    users: finalQueue.map(u => ({
                        firstName: u.firstName,
                        lastName: u.lastName,
                        email: u.email,
                        role: u.role,
                        grade: u.role === "student" ? u.grade : undefined,
                        school: u.role === "student" ? u.school : undefined,
                    })),
                    sendInvitation: true
                })

                const successes = results.filter(r => r.status === "success").length
                const failures = results.filter(r => r.status === "error")

                if (failures.length === 0) {
                    toast.success(`${successes} users created successfully`)
                    setIsOpen(false)
                } else {
                    toast.warning(`${successes} created, ${failures.length} failed`)
                }
            }
        } catch (error) {
            const parsedError = parseConvexError(error)
            if (parsedError) {
                toast.error(getErrorMessage(parsedError, t, locale))
            } else {
                toast.error(t('errors.operationFailed'))
                console.error(error)
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!user) return
        showAlert({
            title: t('common.delete'),
            description: t('user.deleteConfirm'),
            confirmLabel: t('common.delete'),
            cancelLabel: t('common.cancel'),
            variant: "destructive",
            onConfirm: async () => {
                try {
                    await deleteUser({ userId: user._id })
                    toast.success(t('user.deleted'))
                    setIsOpen(false)
                } catch {
                    toast.error(t('errors.operationFailed'))
                }
            }
        })
    }

    // Default trigger if none provided
    const defaultTrigger = isEditing ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" type="button">
            <Edit className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{t('common.edit')}</span>
        </Button>
    ) : (
        <Button className="gap-2" type="button">
            <UserPlus className="h-4 w-4" />
            {allowedRoles && allowedRoles?.length >= 1 
                ? `${t('common.add')} ${t(`navigation.${allowedRoles[0]}s`)}`
                : t('common.newUsers')
            }
        </Button>
    )

    // Calculate dynamic label for the submit button
    const submitLabel = isEditing 
        ? t('common.save') 
        : (queue.length > 0 ? `Create All (${queue.length})` : t('common.create'))

    return (
        <EntityDialog
            open={isOpen}
            onOpenChange={setIsOpen}
            trigger={trigger || defaultTrigger}
            title={isEditing ? t('common.edit') : t('common.newUsers')}
            description={isEditing ? "Update user details and permissions." : t('common.newUsersDescription')}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            submitLabel={submitLabel}
            maxWidth={isEditing ? "sm:max-w-[600px]" : "sm:max-w-[700px]"}
            leftActions={isEditing && (
                <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={handleDelete}
                    className="mr-auto"
                >
                    <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete')}
                </Button>
            )}
        >
            <div className="grid gap-6">
                {/* INPUT FORM */}
                <div className={`grid gap-4 ${!isEditing ? "p-4 border rounded-lg bg-muted/30" : ""}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="firstName">{t('teacher.firstName')}</Label>
                            <Input 
                                id="firstName" 
                                value={formData.firstName}
                                onChange={e => setFormData({...formData, firstName: e.target.value})}
                                required={isEditing} 
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="lastName">{t('teacher.lastName')}</Label>
                            <Input 
                                id="lastName" 
                                value={formData.lastName}
                                onChange={e => setFormData({...formData, lastName: e.target.value})}
                                required={isEditing}
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="email">{t('teacher.email')}</Label>
                        <Input 
                            id="email" 
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({...formData, email: e.target.value})}
                            required={isEditing}
                        />
                    </div>

                    {formData.role === "student" && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="grade">{t('student.grade')}</Label>
                                <Select 
                                    value={formData.grade} 
                                    onValueChange={(v) => setFormData({...formData, grade: v})}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('student.selectGrade')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {GRADE_VALUES.map((code) => (
                                            <SelectItem key={code} value={code}>
                                                {t(`student.grades.${code}`)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="school">{t('student.school')}</Label>
                                <Input 
                                    id="school" 
                                    value={formData.school} 
                                    onChange={e => setFormData({...formData, school: e.target.value})}
                                    placeholder="School Name"
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="role">{t('teacher.role')}</Label>
                            <Select 
                                value={formData.role} 
                                onValueChange={(v) => setFormData({...formData, role: v as UserRole})}
                                disabled={isEditing || rolesToDisplay.length === 1}
                            >
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
                        </div>
                        
                        {isEditing && (
                            <div className="grid gap-2">
                                <Label htmlFor="status">{t('common.status')}</Label>
                                <Select 
                                    value={formData.status}
                                    onValueChange={(v) => setFormData({...formData, status: v})}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">{t('common.active')}</SelectItem>
                                        <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    {/* Add to Queue Button */}
                    {!isEditing && (
                        <div className="flex justify-end mt-2">
                            <Button 
                                type="button" 
                                onClick={handleAddToQueue} 
                                variant="secondary" 
                                size="sm" 
                                className="gap-2"
                                disabled={!formData.email}
                            >
                                <Plus className="h-4 w-4" />
                                {t('common.addToQueue')}
                            </Button>
                        </div>
                    )}
                </div>

                {/* QUEUE LIST */}
                {!isEditing && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>{t('common.usersToCreate', { count: queue.length })}</Label>
                            {queue.length > 0 && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-muted-foreground h-auto p-0"
                                    onClick={() => setQueue([])}
                                    type="button"
                                >
                                    {t('common.clearAll')}
                                </Button>
                            )}
                        </div>
                        
                        <ScrollArea className="h-[150px] border rounded-md">
                            {queue.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
                                    <UserPlus className="h-8 w-8 mb-2 opacity-20" />
                                    <p>{t('common.addBatchUsersInstruction')}</p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {queue.map((u) => (
                                        <div key={u.id} className="flex items-center justify-between p-3 text-sm hover:bg-muted/50">
                                            <div className="grid gap-0.5">
                                                <div className="font-medium flex items-center gap-2">
                                                    {u.firstName} {u.lastName}
                                                    <Badge variant="outline" className="text-[10px] h-5">
                                                        {t(`navigation.${u.role}s`)}
                                                    </Badge>
                                                    {u.grade && (
                                                        <Badge variant="secondary" className="text-[10px] h-5">{u.grade}</Badge>
                                                    )}
                                                </div>
                                                <div className="text-muted-foreground text-xs">{u.email}</div>
                                            </div>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleRemoveFromQueue(u.id)}
                                                type="button"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                )}
            </div>
        </EntityDialog>
    )
}