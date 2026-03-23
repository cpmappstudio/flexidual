"use client";

import { useState, useEffect, useRef } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
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
    Camera,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations, useLocale } from "next-intl"
import { UserRole } from "@/convex/types"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { EntityDialog } from "@/components/ui/entity-dialog"
import { useAlert } from "@/components/providers/alert-provider"
import { parseConvexError, getErrorMessage } from "@/lib/error-utils"
import { GRADE_VALUES } from "@/lib/types/academic"
import { useParams } from "next/navigation"
import { useIsMobile } from "@/hooks/use-mobile"
import { User } from "./users-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface UserDialogProps {
    user?: User
    defaultRole?: UserRole
    allowedRoles?: UserRole[]
    trigger?: React.ReactNode
    open?: boolean 
    onOpenChange?: (open: boolean) => void
}

const ALL_ROLES: UserRole[] = [
    "student",
    "teacher",
    "tutor",
    "admin",
    "superadmin",
];

type PendingUser = {
    id: string
    firstName: string
    lastName: string
    email?: string
    username?: string
    password?: string
    role: UserRole
    grade?: string
    school?: string
    imageBase64?: string
}

export function UserDialog({
    user,
    defaultRole,
    allowedRoles,
    trigger,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: UserDialogProps) {
    const t = useTranslations()
    const locale = useLocale()
    const isEditing = !!user
    const isMobile = useIsMobile()

    // API Hooks
    const createUsers = useAction(api.users.createUsersWithClerk)
    const updateUser = useAction(api.users.updateUserWithClerk)
    const deleteUser = useAction(api.users.deleteUserWithClerk)
    const revokeRoleMutation = useMutation(api.roleAssignments.removeRole)
    const activeRoles = useQuery(api.roleAssignments.getUserRoles, isEditing && user ? { userId: user._id } : "skip");

    const { showAlert } = useAlert()

    // State
    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = controlledOpen !== undefined
    const isOpen = isControlled ? controlledOpen : internalOpen
    const setIsOpen = isControlled ? controlledOnOpenChange! : setInternalOpen
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [queue, setQueue] = useState<PendingUser[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const rolesToDisplay = allowedRoles || ALL_ROLES;

    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        username: "",
        password: "",
        role: defaultRole || "student" as UserRole,
        status: "active",
        grade: "",
        school: "",
        targetSchoolId: "",
        targetCampusId: "",
        imageBase64: ""
    })

    const params = useParams()
    const orgSlug = (params.orgSlug as string) || "system"
    const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug })
    const schools = useQuery(api.schools.list, { isActive: true })
    const campuses = useQuery(api.campuses.list, { isActive: true })

    useEffect(() => {
        if (isOpen) {
            if (isEditing && user) {
                // Safely resolve the existing school and campus IDs for Superadmin edit mode
                let editSchoolId = "";
                let editCampusId = "";
                
                if (user.orgType === "school") {
                    editSchoolId = user.orgId || "";
                } else if (user.orgType === "campus") {
                    editCampusId = user.orgId || "";
                    editSchoolId = campuses?.find(c => c._id === editCampusId)?.schoolId || "";
                }

                setFormData({
                    firstName: user.firstName || "",
                    lastName: user.lastName || "",
                    email: user.email || "",
                    username: user.username || "",
                    password: user.externalPassword || "", 
                    role: (user.role as UserRole) ?? (defaultRole || rolesToDisplay[0]),
                    status: user.isActive ? "active" : "inactive",
                    grade: user.grade || "",
                    school: user.school || "",
                    targetSchoolId: editSchoolId,
                    targetCampusId: editCampusId,
                    imageBase64: user.imageUrl || ""
                })
            } else {
                let defaultSchoolName = "";
                if (orgContext?.type === "school") {
                    defaultSchoolName = orgContext.name;
                } else if (orgContext?.type === "campus" && campuses && schools) {
                    const campus = campuses.find(c => c._id === orgContext._id);
                    const parentSchool = schools.find(s => s._id === campus?.schoolId);
                    if (parentSchool) defaultSchoolName = parentSchool.name;
                }

                setQueue([])
                setFormData({
                    firstName: "",
                    lastName: "",
                    email: "",
                    username: "",
                    password: "",
                    role: (defaultRole || rolesToDisplay[0]) as UserRole,
                    status: "active",
                    grade: "",
                    school: defaultSchoolName,
                    targetSchoolId: "",
                    targetCampusId: "",
                    imageBase64: ""
                })
            }
        }
    }, [isOpen, user, isEditing, defaultRole, rolesToDisplay, orgContext, schools, campuses])

    // --- HANDLERS ---

    const handleAddToQueue = (e: React.FormEvent) => {
        e.preventDefault()
        
        const hasName = formData.firstName.trim() && formData.lastName.trim();
        const hasValidEmail = formData.email.trim().length > 0;
        const hasValidUsername = formData.username.trim().length > 0 && formData.password.trim().length > 0;
        
        if (!hasName || (!hasValidEmail && !hasValidUsername)) return;

        const newUser: PendingUser = {
            id: Math.random().toString(36).substr(2, 9),
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            username: formData.username,
            password: formData.password,
            role: formData.role,
            grade: formData.grade,
            school: formData.school,
            imageBase64: formData.imageBase64?.startsWith("data:image") ? formData.imageBase64 : undefined,
        };

        setQueue([...queue, newUser])
        
        setFormData(prev => ({
            ...prev,
            firstName: "",
            lastName: "",
            email: "",
            username: "",
            password: "",
            imageBase64: ""
        }))

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    const handleRemoveFromQueue = (id: string) => {
        setQueue(queue.filter(u => u.id !== id))
    }

    // This is the main submit handler called by EntityDialog footer button
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!orgContext) {
            toast.error("Loading organization context... Please wait.")
            return
        }

        // --- DETERMINE FINAL ORGANIZATION CONTEXT ---
        let finalOrgType = orgContext.type;
        let finalOrgId: string | undefined = orgContext._id;

        if (orgContext.type === "system") {
            if (formData.role === "superadmin") {
                finalOrgType = "system";
                finalOrgId = undefined;
            } else if (formData.role === "admin") {
                if (!formData.targetSchoolId) return toast.error('Please select a school for this admin');
                finalOrgType = "school";
                finalOrgId = formData.targetSchoolId;
            } else {
                if (!formData.targetCampusId) return toast.error('Please select a campus for this user');
                finalOrgType = "campus";
                finalOrgId = formData.targetCampusId;
            }
        }

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
                        username: formData.username,
                        password: formData.password,
                        role: formData.role, 
                        isActive: formData.status === "active",
                        grade: formData.role === "student" ? formData.grade : undefined,
                        school: formData.role === "student" ? formData.school : undefined,
                        imageBase64: formData.imageBase64?.startsWith("data:image") ? formData.imageBase64 : undefined,
                    },
                    orgType: finalOrgType, 
                    orgId: finalOrgId,     
                })
                
                const fullName = `${formData.firstName} ${formData.lastName}`.trim();
                toast.success(
                    t('userDialog.updateSuccess', { name: fullName }) || 
                    `${fullName} updated successfully`
                );
                
                setIsOpen(false)
            } else {
                // BATCH CREATE MODE
                const finalQueue = [...queue]
                
                const hasValidSingleAuth = formData.email || (formData.username && formData.password);
                
                if (finalQueue.length === 0 && hasValidSingleAuth) {
                    finalQueue.push({
                        id: "temp",
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        email: formData.email,
                        username: formData.username,
                        password: formData.password,
                        role: formData.role,
                        grade: formData.grade,
                        school: formData.school,
                        imageBase64: formData.imageBase64?.startsWith("data:image") ? formData.imageBase64 : undefined
                    })
                }

                if (finalQueue.length === 0) {
                    setIsSubmitting(false)
                    return
                }

                const results = await createUsers({
                    users: finalQueue.map(u => ({
                        firstName: u.firstName,
                        lastName: u.lastName,
                        email: u.email,
                        username: u.username,
                        password: u.password,
                        role: u.role,
                        grade: u.role === "student" ? u.grade : undefined,
                        school: u.role === "student" ? u.school : undefined,
                        imageBase64: u.imageBase64,
                    })),
                    orgType: finalOrgType,
                    orgId: finalOrgId,
                    sendInvitation: true
                })

                const successes = results.filter(r => r.status === "success").length
                const failures = results.filter(r => r.status === "error")

                if (failures.length === 0) {
                    if (successes === 1) {
                        const createdName = `${finalQueue[0].firstName} ${finalQueue[0].lastName}`.trim();
                        toast.success(
                            t("userDialog.createSuccess", { name: createdName }) || 
                            `${createdName} created successfully`
                        );
                    } else {
                        toast.success(
                            t("userDialog.successBatch", { count: successes }) || 
                            `${successes} users created successfully`
                        );
                    }
                    setIsOpen(false)
                } else {
                    toast.warning(
                        t("userDialog.warningBatch", { success: successes, failed: failures.length }) || 
                        `${successes} created, ${failures.length} failed`
                    )
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

    const handleDelete = () => {
        if (!user) return;
        showAlert({
            title: t("user.deleteTitle") || "Delete User",
            description: t("user.deleteDescription", { name: user.fullName }) || "Are you sure you want to delete this user?",
            confirmLabel: t("common.delete"),
            cancelLabel: t("common.cancel"),
            variant: "destructive",
            onConfirm: async () => {
                try {
                    await deleteUser({ userId: user._id });
                    toast.success(t("user.deleted"));
                    setIsOpen(false);
                } catch {
                    toast.error(t("errors.operationFailed"));
                }
            },
        });
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, imageBase64: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    // Default trigger if none provided
    const defaultTrigger = isEditing ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" type="button">
            <Edit className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{t("common.edit")}</span>
        </Button>
    ) : (
        <Button className="gap-2" type="button">
            <Plus className="h-4 w-4" />
            {t("common.add")}
        </Button>
    );

    // Calculate dynamic label for the submit button
    const submitLabel = isEditing
        ? t("common.saveChanges") || "Save Changes"
        : queue.length > 0
            ? t("userDialog.createMultiple", { count: queue.length }) || `Create All (${queue.length})`
            : t("userDialog.createSingle") || "Create User";

    const getOrgName = (orgId?: string, orgType?: string) => {
        if (orgType === "system") return t('common.system') || "System";
        if (orgType === "school") return schools?.find(s => s._id === orgId)?.name || "Unknown School";
        if (orgType === "campus") {
            const campus = campuses?.find(c => c._id === orgId);
            const school = schools?.find(s => s._id === campus?.schoolId);
            if (school && campus) {
                return `${school.name} • ${campus.name}`;
            }
            return campus?.name || "Unknown Campus";
        }
        return orgType || "";
    };

    return (
        <EntityDialog
            open={isOpen}
            onOpenChange={setIsOpen}
            trigger={trigger || defaultTrigger}
            title={isEditing ? t("common.editUser") || "Edit User" : t("common.newUsers")}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            submitLabel={submitLabel}
            maxWidth={isEditing ? "sm:max-w-[600px]" : "sm:max-w-[700px]"}
            leftActions={
                isEditing && (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleDelete}
                    className="text-destructive border border-destructive hover:text-destructive hover:bg-destructive/10"
                >
                    <Trash2 className="h-4 w-4" /> {t("common.delete")}
                </Button>
                )
            }
        >
            <div className="grid gap-2">
                <div className={`grid gap-4 ${!isEditing ? "p-4 border rounded-lg bg-muted/30" : ""}`}>
                    <div className="grid gap-2 mb-4">
                        <Label>{t("userDialog.profileImage") || "Profile Image"}</Label>
                        <div className="flex items-center gap-4">
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border shadow-sm group">
                                <Avatar className="h-full w-full rounded-none">
                                    <AvatarImage 
                                        src={formData.imageBase64 || undefined} 
                                        alt="Profile preview" 
                                        className="object-cover"
                                    />
                                    <AvatarFallback className="bg-muted rounded-none text-lg">
                                        {formData.firstName?.charAt(0)?.toUpperCase() || "U"}
                                    </AvatarFallback>
                                </Avatar>

                                <label 
                                    htmlFor="profileImage"
                                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                    title="Upload picture"
                                >
                                    <Camera className="h-5 w-5 text-white" />
                                </label>
                            </div>

                            <input 
                                id="profileImage" 
                                type="file" 
                                accept="image/*"
                                onChange={handleImageChange}
                                className="hidden"
                                ref={fileInputRef}
                            />
                            
                            <div className="text-xs text-muted-foreground">
                                <p>Click the avatar to upload a picture.</p>
                                <p>Recommended size: 256x256px</p>
                            </div>
                        </div>
                    </div>
                    {/* NAMES */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="firstName">
                                {t('teacher.firstName')}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Input 
                                id="firstName" 
                                placeholder={t("userDialog.placeholders.firstName") || "e.g. Jane"}
                                value={formData.firstName}
                                onChange={e => setFormData({...formData, firstName: e.target.value})}
                                required={isEditing || isMobile} 
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="lastName">
                                {t('teacher.lastName')}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Input 
                                id="lastName" 
                                placeholder={t("userDialog.placeholders.lastName") || "e.g. Doe"}
                                value={formData.lastName}
                                onChange={e => setFormData({...formData, lastName: e.target.value})}
                                required={isEditing || isMobile}
                            />
                        </div>
                    </div>

                    {/* AUTHENTICATION DETAILS */}
                    <div className="grid gap-4 p-4 border rounded-md bg-muted/10">
                        <Label className="text-primary font-semibold">Authentication (Provide at least one)</Label>
                        
                        <div className="grid gap-2">
                            <Label htmlFor="email">{t('teacher.email')} (Optional if using Username)</Label>
                            <Input 
                                id="email" 
                                type="email"
                                placeholder={t("userDialog.placeholders.email") || "jane.doe@example.com"}
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                                required={isEditing && !formData.username} 
                            />
                        </div>

                        {/* Optional Username/Password flow (Usually for students) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="username">Username (Optional)</Label>
                                <Input 
                                    id="username" 
                                    value={formData.username}
                                    onChange={e => setFormData({...formData, username: e.target.value})}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">
                                    Password {formData.username && <span className="text-destructive">*</span>}
                                </Label>
                                <Input 
                                    id="password" 
                                    type="text"
                                    value={formData.password}
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                    placeholder={formData.username ? "Required with username" : ""}
                                    disabled={!formData.username} 
                                />
                            </div>
                        </div>
                    </div>

                    {/* STUDENT FIELDS */}
                    {formData.role === "student" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="school">{t('student.school')}</Label>
                                <Input 
                                    id="school" 
                                    value={formData.school} 
                                    onChange={e => setFormData({...formData, school: e.target.value})}
                                    placeholder={t("userDialog.placeholders.school") || "School Name"}
                                    disabled
                                    className="bg-muted/50"
                                />
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Assigned via organization context.
                                </p>
                            </div>
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
                        </div>
                    )}

                    {isEditing && activeRoles && activeRoles.length > 0 && (
                        <div className="grid gap-3 p-4 border border-primary/20 bg-primary/5 rounded-md">
                            <Label className="text-primary font-semibold">{t("userDialog.revokeRoleSectionTitle")}</Label>
                            <div className="flex flex-wrap gap-2">
                                {activeRoles.map(ar => (
                                    <Badge 
                                        key={ar._id} 
                                        variant={ar.role === "superadmin" ? "destructive" : "secondary"} 
                                        className="flex items-center justify-between py-1 px-2 text-xs max-w-[calc(50%-0.25rem)] w-fit overflow-hidden"
                                    >
                                        <div className="flex items-center truncate mr-1.5">
                                            <span className="capitalize shrink-0">{t(`navigation.${ar.role}`)}</span> 
                                            <span 
                                                className="opacity-60 text-[10px] uppercase ml-1 truncate"
                                                title={getOrgName(ar.orgId, ar.orgType)}
                                            >
                                                ({getOrgName(ar.orgId, ar.orgType)})
                                            </span>
                                        </div>
                                        
                                        <button
                                            type="button"
                                            className="shrink-0 rounded-full p-0.5 hover:bg-destructive/20 focus:outline-none"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                
                                                showAlert({
                                                    title: t("userDialog.revokeRole") || "Revoke Access",
                                                    description: `${t("userDialog.revokeRoleDescription", { role: ar.role, name: `${user.firstName} ${user.lastName}` }) || `Are you sure you want to revoke ${ar.role} access for ${user.firstName} ${user.lastName}? This action cannot be undone.`}`,
                                                    confirmLabel: t("userDialog.revoke") || "Revoke",
                                                    cancelLabel: t("common.cancel") || "Cancel",
                                                    variant: "destructive",
                                                    onConfirm: async () => {
                                                        try {
                                                            await revokeRoleMutation({ assignmentId: ar._id });
                                                            toast.success(t("userDialog.revokeRoleSuccess") || "Role revoked successfully");
                                                        } catch {
                                                            toast.error(t("userDialog.revokeRoleError") || "Failed to revoke role");
                                                        }
                                                    }
                                                });
                                            }}
                                        >
                                            <X className="h-3 w-3 text-current hover:text-destructive transition-colors" />
                                        </button>
                                        
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* UNIFIED ACCESS & ASSIGNMENT SECTION */}
                    <div className="grid gap-4 p-4 border rounded-md bg-muted/10">
                        <Label className="text-primary font-semibold">
                            {isEditing ? "Add New Role / Update Assignment" : "Role & Organization"}
                        </Label>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="role">
                                    {t('teacher.role')}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Select 
                                    value={formData.role} 
                                    onValueChange={(v) => setFormData({...formData, role: v as UserRole})}
                                    disabled={!isEditing && rolesToDisplay.length === 1}
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
                                    <Label htmlFor="status">
                                        {t('common.status')}
                                        <span className="text-destructive">*</span>
                                    </Label>
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

                        {/* MULTI-TENANT SYSTEM ASSIGNMENT */}
                        {orgContext?.type === "system" && formData.role !== "superadmin" && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4 mt-2 border-dashed border-muted-foreground/30">
                                <div className="grid gap-2 min-w-0">
                                    <Label className="text-primary flex items-center gap-1">Assign to School</Label>
                                    <Select 
                                        value={formData.targetSchoolId} 
                                        onValueChange={(v) => {
                                            const schoolName = schools?.find(s => s._id === v)?.name || "";
                                            setFormData({...formData, targetSchoolId: v, targetCampusId: "", school: schoolName});
                                        }}
                                    >
                                        <SelectTrigger className="w-full [&>span]:truncate">
                                            <SelectValue placeholder="Select School" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {schools?.map(s => (
                                                <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Only show Campus if the role demands it */}
                                {formData.role !== "admin" && (
                                    <div className="grid gap-2 min-w-0">
                                        <Label className="text-primary flex items-center gap-1">Assign to Campus</Label>
                                        <Select 
                                            value={formData.targetCampusId} 
                                            onValueChange={(v) => setFormData({...formData, targetCampusId: v})}
                                            disabled={!formData.targetSchoolId}
                                        >
                                            <SelectTrigger className="w-full [&>span]:truncate">
                                                <SelectValue placeholder="Select Campus" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {campuses?.filter(c => c.schoolId === formData.targetSchoolId).map(c => (
                                                    <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Add to Queue Button (Hidden on Mobile) */}
                    {!isEditing && (
                        <div className="justify-end mt-2 hidden md:flex">
                            <Button 
                                type="button" 
                                onClick={handleAddToQueue} 
                                variant="secondary" 
                                size="sm" 
                                className="gap-2"
                                disabled={
                                    (!formData.firstName || !formData.lastName) || 
                                    (!formData.email && (!formData.username || !formData.password))
                                }
                            >
                                <Plus className="h-4 w-4" />
                                {t("userDialog.addToList") || "Add to List"}
                            </Button>
                        </div>
                    )}
                </div>

                {/* QUEUE LIST (Hidden on Mobile) */}
                {!isEditing && (
                    <div className="space-y-2 hidden md:block">
                        <div className="flex items-center justify-between">
                            <Label>{t("userDialog.usersToAdd", { count: queue.length }) || `Users to Create (${queue.length})`}</Label>
                            {queue.length > 0 && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-muted-foreground h-auto p-0"
                                    onClick={() => setQueue([])}
                                    type="button"
                                >
                                    {t("userDialog.clearList") || "Clear All"}
                                </Button>
                            )}
                        </div>
                        
                        <ScrollArea className="h-fit border rounded-md">
                            {queue.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-[160px] text-muted-foreground text-sm gap-2">
                                    <div className="rounded-full bg-muted p-3">
                                        <UserPlus className="h-5 w-5 opacity-40" />
                                    </div>
                                    <p className="text-xs">
                                        {t("userDialog.emptyListInstruction") || "Add users above to build your list."}
                                    </p>
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
                                                <div className="text-muted-foreground text-xs">{u.email || u.username}</div>
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