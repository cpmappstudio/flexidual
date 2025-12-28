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
                toast.success("Student updated")
            } else {
                await createUser({
                    firstName: formData.get("firstName") as string,
                    lastName: formData.get("lastName") as string,
                    email: formData.get("email") as string,
                    role: "student",
                })
                toast.success("Student created")
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
        if (!student || !confirm("Delete this student account?")) return
        try {
            await deleteUser({ userId: student._id })
            toast.success("Student deleted")
            setIsOpen(false)
        } catch (error) {
            toast.error("Failed to delete")
        }
    }

    const trigger = isEditing ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4 text-muted-foreground" />
        </Button>
    ) : (
        <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Student
        </Button>
    )

    return (
        <EntityDialog
            trigger={trigger}
            title={isEditing ? "Edit Student" : "Add New Student"}
            onSubmit={handleSubmit}
            submitLabel={isEditing ? "Save Changes" : "Create Student"}
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
                        <Label>First Name</Label>
                        <Input name="firstName" defaultValue={student?.firstName} required />
                    </div>
                    <div className="grid gap-3">
                        <Label>Last Name</Label>
                        <Input name="lastName" defaultValue={student?.lastName} required />
                    </div>
                </div>
                <div className="grid gap-3">
                    <Label>Email</Label>
                    <Input name="email" type="email" defaultValue={student?.email} required />
                </div>
            </div>
        </EntityDialog>
    )
}