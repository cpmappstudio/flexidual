"use client";

import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
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
import { UserPlus, Edit, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { UserRole } from "@/convex/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { useAlert } from "@/components/providers/alert-provider";
import { parseConvexError, getErrorMessage } from "@/lib/error-utils";
import { GRADE_VALUES } from "@/lib/types/academic";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useIsMobile } from "@/hooks/use-mobile";

interface UserDialogProps {
  user?: Doc<"users">;
  defaultRole?: UserRole;
  allowedRoles?: UserRole[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ALL_ROLES: UserRole[] = [
  "student",
  "teacher",
  "tutor",
  "admin",
  "superadmin",
];

type PendingUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  grade?: string;
  school?: string;
};

export function UserDialog({
  user,
  defaultRole,
  allowedRoles,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: UserDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const isEditing = !!user;
  const isMobile = useIsMobile();

  // API Hooks
  const createUsers = useAction(api.users.createUsersWithClerk);
  const updateUser = useAction(api.users.updateUserWithClerk);
  const deleteUser = useAction(api.users.deleteUserWithClerk);
  const { showAlert } = useAlert();

  // State
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queue, setQueue] = useState<PendingUser[]>([]);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: defaultRole || ("student" as UserRole),
    status: "active",
    grade: "",
    school: "",
  });

  const rolesToDisplay = allowedRoles || ALL_ROLES;

  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });

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
          school: user.school || "",
        });
      } else {
        setQueue([]);
        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          role: (defaultRole || rolesToDisplay[0]) as UserRole,
          status: "active",
          grade: "",
          school: "",
        });
      }
    }
  }, [isOpen, user, isEditing, defaultRole, rolesToDisplay]);

  // --- HANDLERS ---

  const handleAddToQueue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.firstName || !formData.lastName) return;

    const newUser: PendingUser = {
      id: Math.random().toString(36).substr(2, 9),
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      role: formData.role,
      grade: formData.grade,
      school: formData.school,
    };

    setQueue([...queue, newUser]);

    setFormData((prev) => ({
      ...prev,
      firstName: "",
      lastName: "",
      email: "",
    }));
  };

  const handleRemoveFromQueue = (id: string) => {
    setQueue(queue.filter((u) => u.id !== id));
  };

  // This is the main submit handler called by EntityDialog footer button
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orgContext) {
      toast.error("Loading organization context... Please wait.");
      return;
    }

    setIsSubmitting(true);

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
          },
          // Pass the context!
          orgType: orgContext.type,
          orgId: orgContext._id,
        });
        toast.success(t("common.save"));
        setIsOpen(false);
      } else {
        // BATCH CREATE MODE
        const finalQueue = [...queue];
        if (finalQueue.length === 0 && formData.email) {
          finalQueue.push({
            id: "temp",
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            role: formData.role,
            grade: formData.grade,
            school: formData.school,
          });
        }

        if (finalQueue.length === 0) {
          setIsSubmitting(false);
          return;
        }

        const results = await createUsers({
          users: finalQueue.map((u) => ({
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            role: u.role,
            grade: u.role === "student" ? u.grade : undefined,
            school: u.role === "student" ? u.school : undefined,
          })),
          orgType: orgContext.type,
          orgId: orgContext._id,
          sendInvitation: true,
        });

        const successes = results.filter((r) => r.status === "success").length;
        const failures = results.filter((r) => r.status === "error");

        if (failures.length === 0) {
          toast.success(t("userDialog.successBatch", { count: successes }));
          setIsOpen(false);
        } else {
          toast.warning(
            t("userDialog.warningBatch", {
              success: successes,
              failed: failures.length,
            }),
          );
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
    showAlert({
      title: t("user.deleteTitle"),
      description: t("user.deleteDescription", { name: user.fullName }),
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
    ? t("common.saveChanges")
    : queue.length > 0
      ? t("userDialog.createMultiple", { count: queue.length })
      : t("userDialog.createSingle");

  return (
    <EntityDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger || defaultTrigger}
      title={isEditing ? t("common.editUser") : t("common.newUsers")}
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
        {/* INPUT FORM */}
        <div
          className={`grid gap-4 ${!isEditing ? "rounded-lg md:border md:border-border/60 md:p-4" : ""}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="firstName">
                {t("teacher.firstName")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder={t("userDialog.placeholders.firstName")}
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                required={isEditing || isMobile}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">
                {t("teacher.lastName")}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                placeholder={t("userDialog.placeholders.lastName")}
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                required={isEditing || isMobile}
              />
            </div>
          </div>

          {isEditing ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">
                  {t("teacher.email")}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("userDialog.placeholders.email")}
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required={isEditing || isMobile}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    disabled={isEditing || rolesToDisplay.length === 1}
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
                <div className="grid gap-2">
                  <Label htmlFor="status">
                    {t("common.status")}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v) =>
                      setFormData({ ...formData, status: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        {t("common.active")}
                      </SelectItem>
                      <SelectItem value="inactive">
                        {t("common.inactive")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">
                  {t("teacher.email")}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("userDialog.placeholders.email")}
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required={isEditing || isMobile}
                />
              </div>
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
                  disabled={isEditing || rolesToDisplay.length === 1}
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
            </div>
          )}

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
                  placeholder={t("userDialog.placeholders.school")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="grade">{t("student.grade")}</Label>
                <Select
                  value={formData.grade}
                  onValueChange={(v) => setFormData({ ...formData, grade: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("student.selectGrade")} />
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

          {/* Add to Queue Button */}
          {!isEditing && (
            <div className="justify-end hidden md:flex">
              <Button
                type="button"
                onClick={handleAddToQueue}
                variant="secondary"
                size="sm"
                className="gap-2"
                disabled={!formData.email}
              >
                {t("userDialog.addToList")}
              </Button>
            </div>
          )}
        </div>

        {/* QUEUE LIST */}
        {!isEditing && (
          <div className="space-y-2 hidden md:block">
            <div className="flex items-center justify-between">
              <Label>
                {t("userDialog.usersToAdd", { count: queue.length })}
              </Label>
              {queue.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-auto p-0"
                  onClick={() => setQueue([])}
                  type="button"
                >
                  {t("userDialog.clearList")}
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
                    {t("userDialog.emptyListInstruction")}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {queue.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3 text-sm hover:bg-muted/50"
                    >
                      <div className="grid gap-0.5">
                        <div className="font-medium flex items-center gap-2">
                          {u.firstName} {u.lastName}
                          <Badge variant="outline" className="text-[10px] h-5">
                            {t(`navigation.${u.role}s`)}
                          </Badge>
                          {u.grade && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-5"
                            >
                              {u.grade}
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {u.email}
                        </div>
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
  );
}
