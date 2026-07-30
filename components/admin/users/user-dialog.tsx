"use client";

import { useState, useEffect, useRef } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit, Trash2, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { UserRole } from "@/convex/types";
import { Badge } from "@/components/ui/badge";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { useAlert } from "@/components/providers/alert-provider";
import { parseConvexError, getErrorMessage } from "@/lib/error-utils";
import { useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageCreateButton } from "@/components/ui/responsive-page-action";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

interface UserDialogUser {
  _id: Id<"users">;
  email?: string;
  username?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  imageUrl?: string;
  isActive: boolean;
  grade?: string;
  school?: string;
  role?: UserRole;
  orgId?: string;
  orgType?: "system" | "school" | "campus";
}

interface UserDialogProps {
  user?: UserDialogUser;
  defaultRole?: UserRole;
  allowedRoles?: UserRole[];
  scope?: {
    orgType: "school" | "campus";
    orgId: string;
  };
  campusSelectionSchoolId?: Id<"schools">;
  hideRole?: boolean;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDeleted?: () => void;
}

const ALL_ROLES: UserRole[] = [
  "student",
  "teacher",
  "tutor",
  "principal",
  "admin",
  "superadmin",
];

export function UserDialog({
  user,
  defaultRole,
  allowedRoles,
  scope,
  campusSelectionSchoolId,
  hideRole = false,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onDeleted,
}: UserDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const isEditing = !!user;
  const { isAuthenticated } = useConvexAuth();

  // API Hooks
  const createUsers = useAction(api.users.createUsersWithClerk);
  const updateUser = useAction(api.users.updateUserWithClerk);
  const deleteUser = useAction(api.users.deleteUserWithClerk);
  const revokeRoleMutation = useMutation(api.roleAssignments.removeRole);
  const activeRoles = useQuery(
    api.roleAssignments.getUserRoles,
    isAuthenticated && !hideRole && isEditing && user
      ? { userId: user._id }
      : "skip",
  );

  const { showAlert } = useAlert();

  // State
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rolesToDisplay = allowedRoles || ALL_ROLES;
  const defaultDisplayedRole = rolesToDisplay[0];

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    role: defaultRole || ("student" as UserRole),
    status: "active",
    grade: "",
    school: "",
    targetSchoolId: "",
    targetCampusId: "",
    imageBase64: "",
  });
  const isStudent = formData.role === "student";

  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const orgContext = useQuery(
    api.organizations.resolveSlug,
    isAuthenticated ? { slug: orgSlug } : "skip",
  );
  const schools = useQuery(
    api.schools.list,
    isAuthenticated ? { isActive: true } : "skip",
  );
  const campuses = useQuery(
    api.campuses.list,
    isAuthenticated ? { isActive: true } : "skip",
  );
  const scopedCampus =
    scope?.orgType === "campus"
      ? campuses?.find((campus) => campus._id === scope.orgId)
      : undefined;
  const selectedCampus = campuses?.find(
    (campus) => campus._id === formData.targetCampusId,
  );
  const scopedSchoolId =
    campusSelectionSchoolId ??
    (scope?.orgType === "school"
      ? (scope.orgId as Id<"schools">)
      : scopedCampus?.schoolId);
  const gradeSchoolId =
    scopedSchoolId ??
    (orgContext?.type === "school"
      ? orgContext._id
      : orgContext?.type === "campus"
        ? campuses?.find((campus) => campus._id === orgContext._id)?.schoolId
        : (formData.targetSchoolId as Id<"schools">) ||
          selectedCampus?.schoolId);
  const grades = useQuery(
    api.grades.list,
    isAuthenticated && isOpen && gradeSchoolId
      ? { schoolId: gradeSchoolId as Id<"schools"> }
      : "skip",
  );

  useEffect(() => {
    if (!grades || !formData.grade) return;
    if (!grades.some((grade) => grade.code === formData.grade)) {
      setFormData((current) => ({ ...current, grade: "" }));
    }
  }, [formData.grade, grades]);

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
          editSchoolId =
            campuses?.find((c) => c._id === editCampusId)?.schoolId || "";
        }

        setFormData({
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          email: user.email || "",
          username: user.username || "",
          password: "",
          role:
            (user.role as UserRole) ?? (defaultRole || defaultDisplayedRole),
          status: user.isActive ? "active" : "inactive",
          grade: user.grade || "",
          school: user.school || "",
          targetSchoolId: editSchoolId,
          targetCampusId: editCampusId,
          imageBase64: user.imageUrl || "",
        });
      } else {
        let defaultSchoolName = "";
        const scopedSchool = schools?.find(
          (school) => school._id === scopedSchoolId,
        );

        if (scopedSchool) {
          defaultSchoolName = scopedSchool.name;
        } else if (orgContext?.type === "school") {
          defaultSchoolName = orgContext.name;
        } else if (orgContext?.type === "campus" && campuses && schools) {
          const campus = campuses.find((c) => c._id === orgContext._id);
          const parentSchool = schools.find((s) => s._id === campus?.schoolId);
          if (parentSchool) defaultSchoolName = parentSchool.name;
        }

        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          username: "",
          password: "",
          role: (defaultRole || defaultDisplayedRole) as UserRole,
          status: "active",
          grade: "",
          school: defaultSchoolName,
          targetSchoolId: scopedSchoolId ?? "",
          targetCampusId: scope?.orgType === "campus" ? scope.orgId : "",
          imageBase64: "",
        });
      }
    }
  }, [
    campusSelectionSchoolId,
    campuses,
    defaultRole,
    isEditing,
    isOpen,
    orgContext,
    defaultDisplayedRole,
    schools,
    scopedSchoolId,
    scope?.orgId,
    scope?.orgType,
    user,
  ]);

  // --- HANDLERS ---

  // This is the main submit handler called by EntityDialog footer button
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgContext) {
      toast.error(t("userDialog.loadingOrgContext"));
      return;
    }

    // --- DETERMINE FINAL ORGANIZATION CONTEXT ---
    let finalOrgType = orgContext.type;
    let finalOrgId: string | undefined = orgContext._id;

    if (
      isEditing &&
      user?.orgType &&
      (user.orgType === "system" || user.orgId)
    ) {
      finalOrgType = user.orgType;
      finalOrgId = user.orgId;
    } else if (campusSelectionSchoolId) {
      if (!formData.targetCampusId) {
        return toast.error(t("userDialog.selectCampusForUser"));
      }
      finalOrgType = "campus";
      finalOrgId = formData.targetCampusId;
    } else if (scope) {
      finalOrgType = scope.orgType;
      finalOrgId = scope.orgId;
    } else if (orgContext.type === "system") {
      if (formData.role === "superadmin") {
        finalOrgType = "system";
        finalOrgId = undefined;
      } else if (formData.role === "admin") {
        if (!formData.targetSchoolId)
          return toast.error(t("userDialog.selectSchoolForAdmin"));
        finalOrgType = "school";
        finalOrgId = formData.targetSchoolId;
      } else {
        if (!formData.targetCampusId)
          return toast.error(t("userDialog.selectCampusForUser"));
        finalOrgType = "campus";
        finalOrgId = formData.targetCampusId;
      }
    }

    setIsSubmitting(true);

    try {
      if (isEditing && user) {
        // EDIT MODE
        const result = await updateUser({
          userId: user._id,
          updates: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email.trim() || undefined,
            username: isStudent
              ? formData.username.trim() || undefined
              : undefined,
            password: formData.password || undefined,
            role: formData.role,
            isActive: formData.status === "active",
            grade: formData.role === "student" ? formData.grade : undefined,
            school: formData.role === "student" ? formData.school : undefined,
            imageBase64: formData.imageBase64?.startsWith("data:image")
              ? formData.imageBase64
              : undefined,
          },
          orgType: finalOrgType,
          orgId: finalOrgId,
        });

        if (result.status === "error") {
          const message =
            result.code === "PASSWORD_TOO_SHORT"
              ? t("errors.passwordTooShort", {
                  count: String(MIN_PASSWORD_LENGTH),
                })
              : result.code === "PASSWORD_REJECTED"
                ? t("errors.passwordRejected", {
                    reason: result.reason ?? t("errors.passwordPolicy"),
                  })
                : result.code === "PASSWORD_UPDATE_UNAVAILABLE"
                  ? t("errors.passwordUpdateUnavailable")
                  : t("errors.passwordUpdateFailed");
          toast.error(message);
          return;
        }

        const fullName = `${formData.firstName} ${formData.lastName}`.trim();
        toast.success(
          t("userDialog.updateSuccess", { name: fullName }) ||
            `${fullName} updated successfully`,
        );

        setIsOpen(false);
      } else {
        const results = await createUsers({
          users: [
            {
              firstName: formData.firstName,
              lastName: formData.lastName,
              email: formData.email.trim() || undefined,
              username: isStudent
                ? formData.username.trim() || undefined
                : undefined,
              password: formData.password || undefined,
              role: formData.role,
              grade: formData.role === "student" ? formData.grade : undefined,
              school: formData.role === "student" ? formData.school : undefined,
              imageBase64: formData.imageBase64?.startsWith("data:image")
                ? formData.imageBase64
                : undefined,
            },
          ],
          orgType: finalOrgType,
          orgId: finalOrgId,
        });

        if (results[0]?.status === "success") {
          const createdName =
            `${formData.firstName} ${formData.lastName}`.trim();
          toast.success(
            t("userDialog.createSuccess", { name: createdName }) ||
              `${createdName} created successfully`,
          );
          setIsOpen(false);
        } else {
          toast.error(results[0]?.reason || t("errors.operationFailed"));
        }
      }
    } catch (error) {
      const parsedError = parseConvexError(error);
      if (parsedError) {
        toast.error(getErrorMessage(parsedError, t, locale));
      } else {
        toast.error(t("errors.operationFailed"));
        console.error(error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!user) return;
    const deleteOrgType =
      user.orgType === "system" ||
      user.orgType === "school" ||
      user.orgType === "campus"
        ? user.orgType
        : orgContext?.type;
    if (!deleteOrgType) return;
    showAlert({
      title: t("user.deleteTitle") || "Delete User",
      description:
        t("user.deleteDescription", { name: user.fullName }) ||
        "Are you sure you want to delete this user?",
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteUser({
            userId: user._id,
            orgType: deleteOrgType,
            orgId:
              deleteOrgType === "system"
                ? undefined
                : (user.orgId ?? orgContext?._id),
          });
          toast.success(t("user.deleted"));
          setIsOpen(false);
          onDeleted?.();
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
        setFormData((prev) => ({
          ...prev,
          imageBase64: reader.result as string,
        }));
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
    <PageCreateButton
      type="button"
      label={
        defaultRole === "student"
          ? t("student.new")
          : defaultRole === "teacher"
            ? t("teacher.new")
            : t("common.add")
      }
    />
  );

  const submitLabel = isEditing
    ? t("common.saveChanges") || "Save Changes"
    : t("userDialog.createSingle") || "Create User";

  const hasStudentAuthentication = Boolean(
    (formData.email.trim() || formData.username.trim()) && formData.password,
  );
  const submitDisabled =
    !formData.firstName.trim() ||
    !formData.lastName.trim() ||
    (!isEditing &&
      (isStudent
        ? !hasStudentAuthentication
        : !formData.email.trim() || !formData.password)) ||
    (formData.role === "student" && !formData.grade) ||
    (!!campusSelectionSchoolId && !formData.targetCampusId);

  const getOrgName = (orgId?: string, orgType?: string) => {
    if (orgType === "system") return t("common.system") || "System";
    if (orgType === "school")
      return schools?.find((s) => s._id === orgId)?.name || "Unknown School";
    if (orgType === "campus") {
      const campus = campuses?.find((c) => c._id === orgId);
      const school = schools?.find((s) => s._id === campus?.schoolId);
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
      title={isEditing ? t("common.editUser") || "Edit User" : submitLabel}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitDisabled={submitDisabled}
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
      <div className="grid gap-4">
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
                className="absolute inset-0 flex items-center justify-center bg-inverse/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Upload picture"
              >
                <Camera className="h-5 w-5 text-inverse-foreground" />
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
              <p>{t("userDialog.clickToUpload")}</p>
              <p>{t("userDialog.recommendedDimensions")}</p>
            </div>
          </div>
        </div>
        {/* NAMES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="firstName">
              {t("teacher.firstName")}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="firstName"
              placeholder={
                t("userDialog.placeholders.firstName") || "e.g. Jane"
              }
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lastName">
              {t("teacher.lastName")}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lastName"
              placeholder={t("userDialog.placeholders.lastName") || "e.g. Doe"}
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
              required
            />
          </div>
        </div>

        {/* AUTHENTICATION DETAILS */}
        <div className="grid gap-4 border-t pt-4">
          <Label className="text-primary font-semibold">
            {t("userDialog.authSection")}
          </Label>

          <div className="grid gap-2">
            <Label htmlFor="email">
              {t("teacher.email")}{" "}
              {isStudent && t("userDialog.emailOptionalHint")}
              {!isStudent && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="email"
              type="email"
              placeholder={
                t("userDialog.placeholders.email") || "jane.doe@example.com"
              }
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required={!isStudent || !formData.username}
            />
          </div>

          <div
            className={
              isStudent ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "grid gap-2"
            }
          >
            {isStudent && (
              <div className="grid gap-2">
                <Label htmlFor="username">
                  {t("userDialog.usernameLabel")}
                </Label>
                <Input
                  id="username"
                  value={formData.username}
                  onKeyDown={(e) => {
                    if (e.key === " ") e.preventDefault();
                  }}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      username: e.target.value.replace(/\s/g, ""),
                    })
                  }
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="password">
                {t("userDialog.passwordLabel")}{" "}
                {!isEditing && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                aria-describedby="password-hint"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder={
                  isStudent && formData.username
                    ? t("userDialog.passwordRequiredHint")
                    : ""
                }
                required={!isEditing}
              />
              <p id="password-hint" className="text-xs text-muted-foreground">
                {isEditing
                  ? t("userDialog.passwordEditHint", {
                      count: String(MIN_PASSWORD_LENGTH),
                    })
                  : t("userDialog.passwordMinimumHint", {
                      count: String(MIN_PASSWORD_LENGTH),
                    })}
              </p>
            </div>
          </div>
        </div>

        {/* STUDENT FIELDS */}
        {formData.role === "student" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="school">{t("student.school")}</Label>
              <Input
                id="school"
                value={formData.school}
                onChange={(e) =>
                  setFormData({ ...formData, school: e.target.value })
                }
                placeholder={
                  t("userDialog.placeholders.school") || "School Name"
                }
                disabled
                className="bg-muted/50"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t("userDialog.orgContextHint")}
              </p>
            </div>
            <div className="grid gap-2 pb-6">
              <Label htmlFor="grade">
                {t("student.grade")} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.grade}
                onValueChange={(v) => setFormData({ ...formData, grade: v })}
              >
                <SelectTrigger
                  disabled={!gradeSchoolId || grades?.length === 0}
                >
                  <SelectValue placeholder={t("student.selectGrade")} />
                </SelectTrigger>
                <SelectContent>
                  {grades?.map((grade) => (
                    <SelectItem key={grade._id} value={grade.code}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {!hideRole && isEditing && activeRoles && activeRoles.length > 0 && (
          <div className="grid gap-3 p-4 border border-primary/20 bg-primary/5 rounded-md">
            <Label className="text-primary font-semibold">
              {t("userDialog.revokeRoleSectionTitle")}
            </Label>
            <div className="flex flex-wrap gap-2">
              {activeRoles.map((ar) => (
                <Badge
                  key={ar._id}
                  variant={
                    ar.role === "superadmin" ? "destructive" : "secondary"
                  }
                  className="flex items-center justify-between py-1 px-2 text-xs max-w-[calc(50%-0.25rem)] w-fit overflow-hidden"
                >
                  <div className="flex items-center truncate mr-1.5">
                    <span className="capitalize shrink-0">
                      {t(`navigation.${ar.role}s`)}
                    </span>
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
                            await revokeRoleMutation({
                              assignmentId: ar._id,
                            });
                            toast.success(
                              t("userDialog.revokeRoleSuccess") ||
                                "Role revoked successfully",
                            );
                          } catch {
                            toast.error(
                              t("userDialog.revokeRoleError") ||
                                "Failed to revoke role",
                            );
                          }
                        },
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

        {(!hideRole ||
          isEditing ||
          (!scope && orgContext?.type === "system") ||
          !!campusSelectionSchoolId) && (
          <div className="grid gap-4 border-t pt-4">
            {!hideRole && (
              <>
                <Label className="font-semibold text-primary">
                  {isEditing
                    ? t("userDialog.addNewRole")
                    : t("userDialog.roleAndOrg")}
                </Label>
                <div className="grid gap-2">
                  <Label htmlFor="role">
                    {t("teacher.role")}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) =>
                      setFormData({ ...formData, role: v as UserRole })
                    }
                    disabled={!isEditing && rolesToDisplay.length === 1}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("teacher.selectRole")} />
                    </SelectTrigger>
                    <SelectContent>
                      {rolesToDisplay.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`navigation.${role}s`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {isEditing && (
              <div className="grid gap-2">
                <Label htmlFor="status">
                  {t("common.status")}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("common.active")}</SelectItem>
                    <SelectItem value="inactive">
                      {t("common.inactive")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* MULTI-TENANT SYSTEM ASSIGNMENT */}
            {orgContext?.type === "system" &&
              !scope &&
              !campusSelectionSchoolId &&
              formData.role !== "superadmin" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4 mt-2 border-dashed border-muted-foreground/30">
                  <div className="grid gap-2 min-w-0">
                    <Label className="text-primary flex items-center gap-1">
                      {t("userDialog.assignToSchool")}
                    </Label>
                    <Select
                      value={formData.targetSchoolId}
                      onValueChange={(v) => {
                        const schoolName =
                          schools?.find((s) => s._id === v)?.name || "";
                        setFormData({
                          ...formData,
                          targetSchoolId: v,
                          targetCampusId: "",
                          school: schoolName,
                        });
                      }}
                    >
                      <SelectTrigger className="w-full [&>span]:truncate">
                        <SelectValue
                          placeholder={t("userDialog.selectSchool")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {schools?.map((s) => (
                          <SelectItem key={s._id} value={s._id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Only show Campus if the role demands it */}
                  {formData.role !== "admin" && (
                    <div className="grid gap-2 min-w-0">
                      <Label className="text-primary flex items-center gap-1">
                        {t("userDialog.assignToCampus")}
                      </Label>
                      <Select
                        value={formData.targetCampusId}
                        onValueChange={(v) =>
                          setFormData({ ...formData, targetCampusId: v })
                        }
                        disabled={!formData.targetSchoolId}
                      >
                        <SelectTrigger className="w-full [&>span]:truncate">
                          <SelectValue
                            placeholder={t("userDialog.selectCampus")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {campuses
                            ?.filter(
                              (c) => c.schoolId === formData.targetSchoolId,
                            )
                            .map((c) => (
                              <SelectItem key={c._id} value={c._id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

            {!isEditing && campusSelectionSchoolId && (
              <div className="grid gap-2 border-t border-dashed border-muted-foreground/30 pt-4">
                <Label className="flex items-center gap-1 text-primary">
                  {t("userDialog.assignToCampus")}
                </Label>
                <Select
                  value={formData.targetCampusId}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      targetCampusId: value,
                    })
                  }
                >
                  <SelectTrigger className="w-full [&>span]:truncate">
                    <SelectValue placeholder={t("userDialog.selectCampus")} />
                  </SelectTrigger>
                  <SelectContent>
                    {campuses
                      ?.filter(
                        (campus) => campus.schoolId === campusSelectionSchoolId,
                      )
                      .map((campus) => (
                        <SelectItem key={campus._id} value={campus._id}>
                          {campus.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </div>
    </EntityDialog>
  );
}
