"use client";

import * as React from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import { EllipsisVertical, GripVertical, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ResponsivePageAction } from "@/components/ui/responsive-page-action";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useSettingsContext } from "@/hooks/use-settings-context";

type Grade = Doc<"institutionGrades">;

function SortableGradeRow({
  grade,
  position,
  onEdit,
  onDelete,
  readOnly,
}: {
  grade: Grade;
  position: number;
  onEdit: (grade: Grade) => void;
  onDelete: (grade: Grade) => void;
  readOnly: boolean;
}) {
  const t = useTranslations("settings.grades");
  const commonT = useTranslations("common");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: grade._id, disabled: readOnly });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 bg-muted shadow-sm" : undefined}
    >
      {!readOnly && <TableCell className="w-12">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          aria-label={t("move", { name: grade.name })}
          {...attributes}
          {...listeners}
        >
          <GripVertical />
        </Button>
      </TableCell>}
      <TableCell className="w-24 text-muted-foreground">{position}</TableCell>
      <TableCell className="font-medium">{grade.name}</TableCell>
      {!readOnly && <TableCell className="w-20 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground data-[state=open]:bg-muted"
              aria-label={`${t("actions")}: ${grade.name}`}
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onSelect={() => onEdit(grade)}>
              {commonT("edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(grade)}
            >
              {commonT("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>}
    </TableRow>
  );
}

export function GradesSettings() {
  const t = useTranslations("settings.grades");
  const commonT = useTranslations("common");
  const { context, isLoading } = useSettingsContext();
  const grades = useQuery(
    api.grades.list,
    context?.canViewInstitutionSettings
      ? { schoolId: context.institution._id }
      : "skip",
  );
  const createGrade = useMutation(api.grades.create);
  const updateGrade = useMutation(api.grades.update);
  const reorderGrades = useMutation(api.grades.reorder);
  const removeGrade = useMutation(api.grades.remove);
  const [orderedGrades, setOrderedGrades] = React.useState<Grade[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingGrade, setEditingGrade] = React.useState<Grade | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Grade | null>(null);
  const [name, setName] = React.useState("");
  const [position, setPosition] = React.useState(1);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  React.useEffect(() => {
    if (grades) setOrderedGrades(grades);
  }, [grades]);

  if (isLoading || (context?.canViewInstitutionSettings && grades === undefined)) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (!context?.canViewInstitutionSettings) {
    return (
      <section>
        <h2 className="border-b pb-3 text-xl font-semibold">
          {t("unavailable")}
        </h2>
      </section>
    );
  }
  const readOnly = !context.canManageInstitution;

  const openCreateDialog = () => {
    setEditingGrade(null);
    setName("");
    setPosition(orderedGrades.length + 1);
    setDialogOpen(true);
  };

  const openEditDialog = (grade: Grade) => {
    setEditingGrade(grade);
    setName(grade.name);
    setPosition(orderedGrades.findIndex((item) => item._id === grade._id) + 1);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingGrade) {
        await updateGrade({ id: editingGrade._id, name, position });
        toast.success(t("updated"));
      } else {
        await createGrade({
          schoolId: context.institution._id,
          name,
          position,
        });
        toast.success(t("created"));
      }
      setDialogOpen(false);
    } catch {
      toast.error(t("saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = orderedGrades.findIndex(
      (grade) => grade._id === active.id,
    );
    const newIndex = orderedGrades.findIndex((grade) => grade._id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = orderedGrades;
    const next = arrayMove(previous, oldIndex, newIndex);
    setOrderedGrades(next);
    try {
      await reorderGrades({
        schoolId: context.institution._id,
        ids: next.map((grade) => grade._id),
      });
    } catch {
      setOrderedGrades(previous);
      toast.error(t("reorderError"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await removeGrade({ id: deleteTarget._id });
      if (!result.deleted) {
        toast.error(t("deleteInUse"));
        return;
      }
      toast.success(t("deleted"));
      setDeleteTarget(null);
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-4 border-b pb-3">
        <h2 className="min-w-0 text-xl font-semibold">
          {t("title")} — {context.institution.name}
        </h2>
        {!readOnly && (
          <ResponsivePageAction>
            <Button
              size="sm"
              onClick={openCreateDialog}
              aria-label={t("add")}
            >
              <Plus />
              <span className="hidden sm:inline">{t("add")}</span>
            </Button>
          </ResponsivePageAction>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <Table className="bg-card">
            <TableHeader className="bg-primary/95">
              <TableRow className="hover:bg-transparent">
                {!readOnly && <TableHead className="w-12" />}
                <TableHead className="w-24 text-muted">{t("order")}</TableHead>
                <TableHead className="text-muted">{t("name")}</TableHead>
                {!readOnly && (
                  <TableHead className="w-20 text-right text-muted">
                    {t("actions")}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedGrades.length ? (
                <SortableContext
                  items={orderedGrades.map((grade) => grade._id)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedGrades.map((grade, index) => (
                    <SortableGradeRow
                      key={grade._id}
                      grade={grade}
                      position={index + 1}
                      onEdit={openEditDialog}
                      onDelete={setDeleteTarget}
                      readOnly={readOnly}
                    />
                  ))}
                </SortableContext>
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={readOnly ? 2 : 4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t("empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>

      {!readOnly && <EntityDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!isSubmitting) setDialogOpen(open);
        }}
        title={editingGrade ? t("editTitle") : t("createTitle")}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitDisabled={
          !name.trim() || !Number.isInteger(position) || position < 1
        }
        submitLabel={editingGrade ? commonT("saveChanges") : t("create")}
        maxWidth="sm:max-w-md"
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="grade-name">{t("name")}</Label>
            <Input
              id="grade-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="grade-position">{t("position")}</Label>
            <Input
              id="grade-position"
              type="number"
              min={1}
              max={Math.max(1, orderedGrades.length + (editingGrade ? 0 : 1))}
              value={position}
              onChange={(event) => setPosition(Number(event.target.value))}
              required
            />
          </div>
        </div>
      </EntityDialog>}

      {!readOnly && <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {commonT("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting && <Loader2 className="animate-spin" />}
              {commonT("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </section>
  );
}
