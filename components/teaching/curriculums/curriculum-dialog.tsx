"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, X, BookOpen, Layers } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CurriculumLessonList } from "./curriculum-lesson-list";
import { useAlert } from "@/components/providers/alert-provider";
import { getErrorMessage, parseConvexError } from "@/lib/error-utils";
import { useIsMobile } from "@/hooks/use-mobile";

// Multi-tenant imports
import { useParams } from "next/navigation";

interface CurriculumDialogProps {
  curriculum?: Doc<"curriculums">;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type PendingCurriculum = {
  id: string;
  title: string;
  code: string;
  description: string;
  gradeCodes?: string[];
};

export function CurriculumDialog({
  curriculum,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CurriculumDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { showAlert } = useAlert();
  const isEditing = !!curriculum;
  const isMobile = useIsMobile();

  // 1. Resolve Multi-Tenant Context
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });

  const createBatch = useMutation(api.curriculums.createBatch);
  const update = useMutation(api.curriculums.update);
  const remove = useMutation(api.curriculums.remove);

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queue, setQueue] = useState<PendingCurriculum[]>([]);

  const [formData, setFormData] = useState({
    title: "",
    code: "",
    description: "",
    isActive: true,
    gradeCodes: [] as string[],
  });

  useEffect(() => {
    if (isOpen) {
      if (isEditing && curriculum) {
        setFormData({
          title: curriculum.title,
          code: curriculum.code || "",
          description: curriculum.description || "",
          isActive: curriculum.isActive,
          gradeCodes: curriculum.gradeCodes || [],
        });
      } else {
        setQueue([]);
        setFormData({
          title: "",
          code: "",
          description: "",
          isActive: true,
          gradeCodes: [],
        });
      }
    }
  }, [isOpen, isEditing, curriculum]);

  const handleAddToQueue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    const newItem: PendingCurriculum = {
      id: Math.random().toString(36).substr(2, 9),
      title: formData.title,
      code: formData.code,
      description: formData.description,
      gradeCodes: formData.gradeCodes,
    };

    setQueue([...queue, newItem]);
    setFormData({
      title: "",
      code: "",
      description: "",
      isActive: true,
      gradeCodes: [],
    });
  };

  const handleRemoveFromQueue = (id: string) => {
    setQueue(queue.filter((q) => q.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orgContext) {
      toast.error("Loading context... please wait.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && curriculum) {
        await update({
          id: curriculum._id,
          title: formData.title,
          code: formData.code || undefined,
          description: formData.description || undefined,
          isActive: formData.isActive,
          gradeCodes:
            formData.gradeCodes.length > 0 ? formData.gradeCodes : undefined,
        });
        toast.success(t("curriculum.updated"));
        setIsOpen(false);
      } else {
        const finalQueue = [...queue];
        if (finalQueue.length === 0 && formData.title) {
          finalQueue.push({
            id: "temp",
            title: formData.title,
            code: formData.code,
            description: formData.description,
            gradeCodes: formData.gradeCodes,
          });
        }

        if (finalQueue.length === 0) return;

        // 2. Pass context so the backend links it to the right School!
        await createBatch({
          orgType: orgContext.type,
          orgId: orgContext._id,
          curriculums: finalQueue.map((q) => ({
            title: q.title,
            code: q.code || undefined,
            description: q.description || undefined,
            gradeCodes:
              q.gradeCodes && q.gradeCodes.length > 0
                ? q.gradeCodes
                : undefined,
          })),
        });

        toast.success(`${finalQueue.length} curriculums created`);
        setIsOpen(false);
      }
    } catch (error: unknown) {
      // Fixed linting 'any' -> 'unknown'
      const parsedError = parseConvexError(error);
      if (parsedError) {
        toast.error(getErrorMessage(parsedError, t, locale));
      } else {
        toast.error(
          error instanceof Error ? error.message : t("errors.operationFailed"),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!curriculum) return;
    showAlert({
      title: t("common.delete"),
      description: t("curriculum.deleteConfirm"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await remove({ id: curriculum._id });
          toast.success(t("curriculum.deleted"));
          setIsOpen(false);
        } catch {
          toast.error(t("errors.operationFailed"));
        }
      },
    });
  };

  const dialogTitle = isEditing
    ? t("curriculum.edit")
    : t("curriculum.createCurriculum") + "s";
  const dialogDesc = isEditing
    ? t("navigation.curriculumEditDescription")
    : t("curriculum.addCurriculums");

  const createLabel =
    queue.length > 0
      ? t("curriculumDialog.createMultiple", { count: queue.length })
      : t("curriculumDialog.createSingle");

  return (
    <EntityDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        trigger ||
        (isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            type="button"
          >
            <Edit className="h-4 w-4 text-muted-foreground" />
          </Button>
        ) : (
          <Button className="gap-2" type="button">
            <Plus className="h-4 w-4" /> {t("common.add")}
          </Button>
        ))
      }
      title={dialogTitle}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEditing ? t("common.saveChanges") : createLabel}
      maxWidth={isEditing ? "sm:max-w-[800px]" : "sm:max-w-[700px]"}
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
      {isEditing ? (
        <Tabs defaultValue="details" className="w-full h-full flex flex-col">
          <TabsList className="w-full justify-start mb-4">
            <TabsTrigger value="details" className="gap-2">
              <BookOpen className="h-4 w-4" /> {t("common.details")}
            </TabsTrigger>
            <TabsTrigger value="lessons" className="gap-2">
              <Layers className="h-4 w-4" /> {t("navigation.lessons")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>
                  {t("curriculum.title")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder={t("curriculumDialog.placeholders.title")}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("curriculum.code")}</Label>
                <Input
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  placeholder={t("curriculumDialog.placeholders.code")}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("common.status")}</Label>
                <Select
                  value={formData.isActive ? "active" : "inactive"}
                  onValueChange={(v) =>
                    setFormData({ ...formData, isActive: v === "active" })
                  }
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

              <div className="grid gap-2">
                <Label>{t("curriculum.targetGrades")}</Label>
                <Input
                  value={formData.gradeCodes.join(", ")}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      gradeCodes: e.target.value
                        .split(",")
                        .map((s) => s.trim()),
                    })
                  }
                  placeholder={t("curriculumDialog.placeholders.targetGrades")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("curriculum.targetGradesHelp")}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("common.description")}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="h-32 resize-none"
                placeholder={t("curriculumDialog.placeholders.description")}
              />
            </div>
          </TabsContent>

          <TabsContent value="lessons" className="flex-1 min-h-[400px]">
            {curriculum && (
              <CurriculumLessonList curriculumId={curriculum._id} />
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="grid gap-2">
          {/* INPUT FORM */}
          <div className="grid gap-4 rounded-lg md:border md:border-border/60 md:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-1 sm:col-span-2 grid gap-2">
                <Label>
                  {t("curriculum.title")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder={t("curriculumDialog.placeholders.title")}
                  required={isMobile}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("curriculum.code")}</Label>
                <Input
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  placeholder={t("curriculumDialog.placeholders.code")}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("common.description")}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="h-20 resize-none"
                placeholder={t("curriculumDialog.placeholders.description")}
              />
            </div>

            {/* Add to Queue Button — desktop only */}
            <div className="justify-end hidden md:flex">
              <Button
                type="button"
                onClick={handleAddToQueue}
                variant="secondary"
                size="sm"
                className="gap-2"
                disabled={!formData.title}
              >
                {t("curriculumDialog.addToList")}
              </Button>
            </div>
          </div>

          {/* QUEUE LIST — desktop only */}
          <div className="space-y-2 hidden md:block">
            <div className="flex items-center justify-between">
              <Label>
                {t("curriculumDialog.curriculumsToAdd", { count: queue.length })}
              </Label>
              {queue.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-auto p-0"
                  onClick={() => setQueue([])}
                  type="button"
                >
                  {t("curriculumDialog.clearList")}
                </Button>
              )}
            </div>

            <ScrollArea className="h-fit border rounded-md">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[160px] text-muted-foreground text-sm gap-2">
                  <div className="rounded-full bg-muted p-3">
                    <BookOpen className="h-5 w-5 opacity-40" />
                  </div>
                  <p className="text-xs">
                    {t("curriculumDialog.emptyListInstruction")}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {queue.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between p-3 text-sm hover:bg-muted/50"
                    >
                      <div className="grid gap-0.5">
                        <div className="font-medium flex items-center gap-2">
                          {q.title}
                          {q.code && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5"
                            >
                              {q.code}
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs line-clamp-1">
                          {q.description}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveFromQueue(q.id)}
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
        </div>
      )}
    </EntityDialog>
  );
}
