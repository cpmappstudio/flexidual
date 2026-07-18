"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BookOpen, Edit, Trash2, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useAlert } from "@/components/providers/alert-provider";
import { Button } from "@/components/ui/button";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoleForOrg } from "@/lib/rbac";
import {
  CourseFormData,
  CourseFormFields,
} from "./course-form-fields";
import { StudentManager } from "./student-manager";

interface ClassDialogProps {
  classDoc: Doc<"classes">;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function getFormData(classDoc: Doc<"classes">): CourseFormData {
  return {
    name: classDoc.name,
    description: classDoc.description || "",
    academicYear: classDoc.academicYear || "",
    curriculumId: classDoc.curriculumId,
    teacherId: classDoc.teacherId || "",
  };
}

export function ClassDialog({
  classDoc,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ClassDialogProps) {
  const t = useTranslations();
  const { showAlert } = useAlert();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const { sessionClaims } = useAuth();
  const role = getRoleForOrg(sessionClaims, orgSlug);
  const isAdmin =
    role === "admin" || role === "principal" || role === "superadmin";
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });
  const curriculums = useQuery(api.curriculums.list, {
    includeInactive: false,
  });
  const teachers = useQuery(
    api.users.getUsers,
    isAdmin && orgContext
      ? {
          role: "teacher",
          orgType: orgContext.type,
          orgId: orgContext._id,
        }
      : "skip",
  );
  const updateClass = useMutation(api.classes.update);
  const deleteClass = useMutation(api.classes.remove);
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(() => getFormData(classDoc));

  useEffect(() => {
    if (isOpen) setFormData(getFormData(classDoc));
  }, [classDoc, isOpen]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await updateClass({
        classId: classDoc._id,
        name: formData.name,
        description: formData.description || undefined,
        academicYear: formData.academicYear || undefined,
        curriculumId: formData.curriculumId as Id<"curriculums">,
        teacherId: formData.teacherId
          ? (formData.teacherId as Id<"users">)
          : undefined,
      });
      toast.success(t("class.updated"));
      setIsOpen(false);
    } catch {
      toast.error(t("errors.operationFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    showAlert({
      title: t("common.delete"),
      description: t("class.deleteConfirm"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteClass({ id: classDoc._id });
          toast.success(t("class.deleted"));
          setIsOpen(false);
        } catch {
          toast.error(t("errors.operationFailed"));
        }
      },
    });
  };

  return (
    <EntityDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        trigger || (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4 text-muted-foreground" />
          </Button>
        )
      }
      title={t("class.edit")}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={t("common.saveChanges")}
      maxWidth="sm:max-w-[700px]"
      leftActions={
        <Button
          type="button"
          variant="ghost"
          onClick={handleDelete}
          className="border border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> {t("common.delete")}
        </Button>
      }
    >
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="mb-4 w-full justify-start">
          <TabsTrigger value="details" className="gap-2">
            <BookOpen className="h-4 w-4" /> {t("common.details")}
          </TabsTrigger>
          <TabsTrigger value="students" className="gap-2">
            <Users className="h-4 w-4" /> {t("navigation.students")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <CourseFormFields
            formData={formData}
            setFormDataAction={setFormData}
            curriculums={curriculums}
            teachers={teachers}
            isAdmin={isAdmin}
          />
        </TabsContent>

        <TabsContent value="students" className="min-h-[300px]">
          <div className="rounded-md border bg-background p-4">
            <StudentManager
              classId={classDoc._id}
              curriculumId={formData.curriculumId as Id<"curriculums">}
            />
          </div>
        </TabsContent>
      </Tabs>
    </EntityDialog>
  );
}
