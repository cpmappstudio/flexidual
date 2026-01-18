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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { 
    UserPlus, 
    Edit, 
    Trash2, 
    Plus, 
    X,
    Loader2
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { UserRole } from "@/convex/types"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

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
    allowedRoles?: UserRole[]
}

const ALL_ROLES: UserRole[] = ["student", "teacher", "tutor", "admin", "superadmin"]

// Temporary type for the queue
type PendingUser = {
    id: string
    firstName: string
    lastName: string
    email: string
    role: UserRole
}

export function UserDialog({ user, defaultRole, allowedRoles }: UserDialogProps) {
    const t = useTranslations()
    const isEditing = !!user
    
    // API Hooks
    const createUsers = useAction(api.users.createUsersWithClerk) // Plural action
    const updateUser = useAction(api.users.updateUserWithClerk)
    const deleteUser = useAction(api.users.deleteUserWithClerk)

    // State
    const [isOpen, setIsOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    
    // Batch Mode State
    const [queue, setQueue] = useState<PendingUser[]>([])
    
    // Form Inputs (Used for both single edit and batch adding)
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        role: defaultRole || "student" as UserRole,
        status: "active"
    })

    // Determine roles
    
    const rolesToDisplay = allowedRoles || ALL_ROLES

    // Reset form when dialog opens/closes
    useEffect(() => {
        if (isOpen) {
            if (isEditing && user) {
                setFormData({
                    firstName: user.firstName || "",
                    lastName: user.lastName || "",
                    email: user.email,
                    role: user.role as UserRole,
                    status: user.isActive ? "active" : "inactive"
                })
            } else {
                setQueue([])
                setFormData({
                    firstName: "",
                    lastName: "",
                    email: "",
                    role: (defaultRole || rolesToDisplay[0]) as UserRole,
                    status: "active"
                })
            }
        }
    }, [isOpen, user])

    // --- BATCH MODE HANDLERS ---

    const handleAddToQueue = (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.email || !formData.firstName || !formData.lastName) return

        const newUser: PendingUser = {
            id: Math.random().toString(36).substr(2, 9),
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            role: formData.role
        }

        setQueue([...queue, newUser])
        
        // Reset inputs but keep role
        setFormData(prev => ({
            ...prev,
            firstName: "",
            lastName: "",
            email: ""
        }))
        
        // Focus back on first name (optional, would require ref)
    }

    const handleRemoveFromQueue = (id: string) => {
        setQueue(queue.filter(u => u.id !== id))
    }

    const handleBatchSubmit = async () => {
        if (queue.length === 0) return
        setIsSubmitting(true)

        try {
            const results = await createUsers({
                users: queue.map(u => ({
                    firstName: u.firstName,
                    lastName: u.lastName,
                    email: u.email,
                    role: u.role
                })),
                sendInvitation: true // Could be a checkbox option
            })

            const successes = results.filter(r => r.status === "success").length
            const failures = results.filter(r => r.status === "error")

            if (failures.length === 0) {
                toast.success(`${successes} users created successfully`)
                setIsOpen(false)
            } else {
                toast.warning(`${successes} created, ${failures.length} failed`)
                // Keep failed users in queue? For now, we close to keep it simple, 
                // or you could filter the queue to only show failed ones.
                console.error("Failed users:", failures)
            }
        } catch (error) {
            toast.error("Batch creation failed")
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    // --- SINGLE EDIT HANDLER ---

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return
        setIsSubmitting(true)

        try {
            await updateUser({
                userId: user._id,
                updates: {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    email: formData.email,
                    role: formData.role, 
                    isActive: formData.status === "active",
                }
            })
            toast.success(t('common.save'))
            setIsOpen(false)
        } catch (error) {
            toast.error("Update failed" + (error instanceof Error ? `: ${error.message}` : ""))
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
            toast.error("Delete failed" + (error instanceof Error ? `: ${error.message}` : ""))
        }
    }

    // --- RENDER HELPERS ---

    const trigger = isEditing ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{t('common.edit')}</span>
        </Button>
    ) : (
        <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            {allowedRoles?.length === 1 
                ? `${t('common.add')} ${t(`navigation.${allowedRoles[0]}s`)}`
                : t('common.add') + " Users"
            }
        </Button>
    )

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className={isEditing ? "sm:max-w-[500px]" : "sm:max-w-[700px]"}>
                <DialogHeader>
                    <DialogTitle>
                        {isEditing ? t('common.edit') : "Add Users"}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing 
                            ? "Update user details and permissions." 
                            : "Add one or more users to the platform."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* INPUT FORM */}
                    <form 
                        id="user-form" 
                        onSubmit={isEditing ? handleEditSubmit : handleAddToQueue}
                        className="grid gap-4 p-4 border rounded-lg bg-muted/30"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="firstName">{t('teacher.firstName')}</Label>
                                <Input 
                                    id="firstName" 
                                    value={formData.firstName}
                                    onChange={e => setFormData({...formData, firstName: e.target.value})}
                                    required 
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="lastName">{t('teacher.lastName')}</Label>
                                <Input 
                                    id="lastName" 
                                    value={formData.lastName}
                                    onChange={e => setFormData({...formData, lastName: e.target.value})}
                                    required 
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
                                required 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="role">{t('teacher.role')}</Label>
                                {/* Role is locked in edit mode */}
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

                        {/* Add to Queue Button (Create Mode Only) */}
                        {!isEditing && (
                            <div className="flex justify-end mt-2">
                                <Button type="submit" variant="secondary" size="sm" className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add to Queue
                                </Button>
                            </div>
                        )}
                    </form>

                    {/* QUEUE LIST (Create Mode Only) */}
                    {!isEditing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Users to Create ({queue.length})</Label>
                                {queue.length > 0 && (
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="text-muted-foreground h-auto p-0"
                                        onClick={() => setQueue([])}
                                    >
                                        Clear All
                                    </Button>
                                )}
                            </div>
                            
                            <ScrollArea className="h-[150px] border rounded-md">
                                {queue.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
                                        <UserPlus className="h-8 w-8 mb-2 opacity-20" />
                                        <p>Add users above to build your list.</p>
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
                                                    </div>
                                                    <div className="text-muted-foreground text-xs">{u.email}</div>
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleRemoveFromQueue(u.id)}
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

                <DialogFooter className="gap-2">
                    {isEditing && (
                         <Button 
                            type="button" 
                            variant="destructive" 
                            onClick={handleDelete}
                            className="mr-auto"
                        >
                            <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete')}
                        </Button>
                    )}

                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        {t('common.cancel')}
                    </Button>
                    
                    {isEditing ? (
                        <Button 
                            onClick={handleEditSubmit} 
                            disabled={isSubmitting}
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('common.save')}
                        </Button>
                    ) : (
                        <Button 
                            onClick={handleBatchSubmit} 
                            disabled={queue.length === 0 || isSubmitting}
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('common.create')} {queue.length > 0 && `(${queue.length})`}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}