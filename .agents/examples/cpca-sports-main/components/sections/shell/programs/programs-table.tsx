"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { LayoutTemplate, Shapes } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ROUTES } from "@/lib/navigation/routes";
import { DeleteDialog } from "./delete-dialog";
import { ProgramsGrid } from "./programs-grid";
import { TemplatesTable } from "./templates-table";

interface ProgramsTableProps {
  organizationId: Id<"organizations">;
  organizationSlug: string;
  programs: Doc<"programs">[];
  templates: Doc<"formTemplates">[];
}

function getProgramEditorHref(
  organizationSlug: string,
  programId: Doc<"programs">["_id"],
) {
  return `${ROUTES.org.programs.create(organizationSlug)}?programId=${encodeURIComponent(programId)}`;
}

function sortProgramsByUpdatedAt(programs: Doc<"programs">[]) {
  return [...programs].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function ProgramsTable({
  organizationId,
  organizationSlug,
  programs,
  templates,
}: ProgramsTableProps) {
  const router = useRouter();
  const t = useTranslations("Programs");
  const tActions = useTranslations("Common.actions");
  const setProgramActive = useMutation(api.programs.setActive);
  const deleteProgram = useMutation(api.programs.remove);
  const deleteTemplate = useMutation(api.formTemplates.remove);
  const [programRows, setProgramRows] = useState(() =>
    sortProgramsByUpdatedAt(programs),
  );
  const [templateRows, setTemplateRows] = useState(templates);
  const [busyProgramId, setBusyProgramId] = useState<
    Doc<"programs">["_id"] | null
  >(null);
  const [busyTemplateId, setBusyTemplateId] = useState<
    Doc<"formTemplates">["_id"] | null
  >(null);
  const [deleteProgramTarget, setDeleteProgramTarget] =
    useState<Doc<"programs"> | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] =
    useState<Doc<"formTemplates"> | null>(null);

  useEffect(() => {
    setProgramRows(sortProgramsByUpdatedAt(programs));
  }, [programs]);

  useEffect(() => {
    setTemplateRows(templates);
  }, [templates]);

  const handleEditProgram = (programId: Doc<"programs">["_id"]) => {
    router.push(getProgramEditorHref(organizationSlug, programId));
  };

  const handleEditTemplate = (templateId: Doc<"formTemplates">["_id"]) => {
    router.push(ROUTES.org.forms.detail(organizationSlug, templateId));
  };

  const handleToggleProgramActive = async (program: Doc<"programs">) => {
    const nextIsActive = program.isActive === false;
    setBusyProgramId(program._id);

    try {
      await setProgramActive({
        programId: program._id,
        isActive: nextIsActive,
      });

      setProgramRows((current) =>
        sortProgramsByUpdatedAt(
          current.map((row) =>
            row._id === program._id
              ? {
                  ...row,
                  isActive: nextIsActive,
                  updatedAt: Date.now(),
                }
              : row,
          ),
        ),
      );

      toast.success(
        nextIsActive
          ? t("programsGrid.feedback.activated")
          : t("programsGrid.feedback.deactivated"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("programsGrid.feedback.actionError"),
      );
    } finally {
      setBusyProgramId(null);
    }
  };

  const handleDeleteProgram = async () => {
    if (!deleteProgramTarget) {
      return;
    }

    setBusyProgramId(deleteProgramTarget._id);

    try {
      await deleteProgram({ programId: deleteProgramTarget._id });
      setProgramRows((current) =>
        current.filter((program) => program._id !== deleteProgramTarget._id),
      );
      toast.success(t("programsGrid.feedback.deleted"));
      setDeleteProgramTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("programsGrid.feedback.deleteError"),
      );
    } finally {
      setBusyProgramId(null);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateTarget) {
      return;
    }

    setBusyTemplateId(deleteTemplateTarget._id);

    try {
      const result = await deleteTemplate({
        templateId: deleteTemplateTarget._id,
      });

      setTemplateRows((current) =>
        current.filter((template) => template._id !== deleteTemplateTarget._id),
      );
      toast.success(
        result === "archived"
          ? t("templatesTable.feedback.archived")
          : t("templatesTable.feedback.deleted"),
      );
      setDeleteTemplateTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("templatesTable.feedback.deleteError"),
      );
    } finally {
      setBusyTemplateId(null);
    }
  };

  return (
    <>
      <Tabs defaultValue="programs" className="gap-0">
        <TabsList>
          <TabsTrigger value="programs">
            <Shapes className="size-4" />
            {t("tabs.programs")}
          </TabsTrigger>
          <TabsTrigger value="templates">
            <LayoutTemplate className="size-4" />
            {t("tabs.templates")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="outline-none">
          <ProgramsGrid
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            programs={programRows}
            busyProgramId={busyProgramId}
            onEdit={handleEditProgram}
            onToggleActive={(program) =>
              void handleToggleProgramActive(program)
            }
            onDelete={setDeleteProgramTarget}
          />
        </TabsContent>

        <TabsContent value="templates" className="outline-none">
          <TemplatesTable
            templates={templateRows}
            busyTemplateId={busyTemplateId}
            onEdit={handleEditTemplate}
            onDelete={setDeleteTemplateTarget}
          />
        </TabsContent>
      </Tabs>

      <DeleteDialog
        open={deleteProgramTarget !== null}
        busy={busyProgramId !== null}
        title={t("programsGrid.deleteDialog.title")}
        description={
          deleteProgramTarget
            ? t("programsGrid.deleteDialog.description", {
                name: deleteProgramTarget.name,
              })
            : ""
        }
        cancelLabel={tActions("cancel")}
        confirmLabel={t("programsGrid.deleteDialog.confirm")}
        onOpenChange={(open) => {
          if (!open && busyProgramId === null) {
            setDeleteProgramTarget(null);
          }
        }}
        onConfirm={() => void handleDeleteProgram()}
      />

      <DeleteDialog
        open={deleteTemplateTarget !== null}
        busy={busyTemplateId !== null}
        title={t("templatesTable.deleteDialog.title")}
        description={
          deleteTemplateTarget
            ? t("templatesTable.deleteDialog.description", {
                name: deleteTemplateTarget.name,
              })
            : ""
        }
        cancelLabel={tActions("cancel")}
        confirmLabel={t("templatesTable.deleteDialog.confirm")}
        onOpenChange={(open) => {
          if (!open && busyTemplateId === null) {
            setDeleteTemplateTarget(null);
          }
        }}
        onConfirm={() => void handleDeleteTemplate()}
      />
    </>
  );
}
