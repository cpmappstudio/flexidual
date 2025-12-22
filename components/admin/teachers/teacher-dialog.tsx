"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
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
    const isEditing = !!teacher
    
    // API Hooks
    const createUser = useMutation(api.users.createUser)
    const updateUser = useMutation(api.users.updateUser)
    const deleteUser = useMutation(api.users.deleteUser)

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
                    }
                })
                toast.success("Teacher updated")
            } else {
                await createUser({
                    firstName: formData.get("firstName") as string,
                    lastName: formData.get("lastName") as string,
                    email: formData.get("email") as string,
                    role: formData.get("role") as "teacher" | "admin",
                })
                toast.success("Teacher created")
            }
            setIsOpen(false)
        } catch (error) {
            console.error(error)
            toast.error("Operation failed")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!teacher) return
        if (!confirm("Are you sure? This will permanently delete this teacher account.")) return
        
        try {
            await deleteUser({ userId: teacher._id })
            toast.success("Teacher deleted")
            setIsOpen(false)
        } catch (error) {
            toast.error("Failed to delete teacher")
        }
    }

    // Trigger Button Logic
    const trigger = isEditing ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Edit</span>
        </Button>
    ) : (
        <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Teacher
        </Button>
    )

    return (
        <EntityDialog
            trigger={trigger}
            title={isEditing ? "Edit Teacher" : "Add New Teacher"}
            onSubmit={handleSubmit}
            submitLabel={isEditing ? "Save Changes" : "Create Teacher"}
            open={isOpen}
            onOpenChange={setIsOpen}
            isSubmitting={isSubmitting}
            leftActions={isEditing ? (
                <Button type="button" variant="destructive" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
            ) : undefined}
        >
            <div className="grid gap-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-3">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input 
                            id="firstName" 
                            name="firstName" 
                            defaultValue={teacher?.firstName} 
                            required 
                        />
                    </div>
                    <div className="grid gap-3">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input 
                            id="lastName" 
                            name="lastName" 
                            defaultValue={teacher?.lastName} 
                            required 
                        />
                    </div>
                </div>

                <div className="grid gap-3">
                    <Label htmlFor="email">Email</Label>
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
                        <Label htmlFor="role">Role</Label>
                        <Select name="role" defaultValue={teacher?.role || "teacher"}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="teacher">Teacher</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    {isEditing && (
                        <div className="grid gap-3">
                            <Label htmlFor="status">Status</Label>
                            <Select name="status" defaultValue={teacher?.isActive ? "active" : "inactive"}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </div>
        </EntityDialog>
    )
}