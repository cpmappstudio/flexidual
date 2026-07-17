"use client";

import {
  type ComponentType,
  type KeyboardEvent,
  useMemo,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { MoreHorizontal, Pencil, Power, Shapes, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ProgramIconAvatar } from "@/components/sections/shell/programs/program-icon-avatar";
import { ProgramCreateDialog } from "./program-create-dialog";

interface ProgramsGridProps {
  organizationId: Id<"organizations">;
  organizationSlug: string;
  programs: Doc<"programs">[];
  busyProgramId: Doc<"programs">["_id"] | null;
  onEdit: (programId: Doc<"programs">["_id"]) => void;
  onToggleActive: (program: Doc<"programs">) => void;
  onDelete: (program: Doc<"programs">) => void;
}

interface ProgramActionMenuItemsProps {
  Group: ComponentType<PropsWithChildren>;
  Item: ComponentType<{
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
    variant?: "default" | "destructive";
  }>;
  Separator: ComponentType;
  isActive: boolean;
  isBusy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function isProgramActive(program: Doc<"programs">) {
  return program.isActive !== false;
}

function ProgramActionMenuItems({
  Group,
  Item,
  Separator,
  isActive,
  isBusy,
  onEdit,
  onToggleActive,
  onDelete,
}: ProgramActionMenuItemsProps) {
  const t = useTranslations("Programs");
  const tActions = useTranslations("Common.actions");

  return (
    <>
      <Group>
        <Item disabled={isBusy} onSelect={onEdit}>
          <Pencil className="h-4 w-4" />
          {tActions("edit")}
        </Item>
        <Item disabled={isBusy} onSelect={onToggleActive}>
          <Power className="h-4 w-4" />
          {isActive
            ? t("programsGrid.actions.deactivate")
            : t("programsGrid.actions.activate")}
        </Item>
      </Group>
      <Separator />
      <Group>
        <Item disabled={isBusy} onSelect={onDelete} variant="destructive">
          <Trash2 className="h-4 w-4" />
          {tActions("delete")}
        </Item>
      </Group>
    </>
  );
}

function ProgramCard({
  program,
  isBusy,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  program: Doc<"programs">;
  isBusy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Programs");
  const locale = useLocale();
  const active = isProgramActive(program);
  const updatedAt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(program.updatedAt)),
    [locale, program.updatedAt],
  );

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onEdit();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="link"
          tabIndex={0}
          className="group block h-full cursor-pointer outline-none"
          onClick={onEdit}
          onKeyDown={handleCardKeyDown}
        >
          <Card className="relative mx-auto h-full w-full max-w-sm overflow-hidden pt-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
            <div
              className={`absolute top-3 left-3 z-40 h-2.5 w-2.5 rounded-full ${
                active
                  ? "bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.9)]"
                  : "bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.8)]"
              }`}
              title={
                active
                  ? t("programsGrid.status.active")
                  : t("programsGrid.status.inactive")
              }
            />
            <div className="absolute top-2.5 right-2.5 z-40">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 bg-black/45 text-white shadow-sm hover:bg-black/60"
                    aria-label={t("programsGrid.actions.moreOptions")}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-44"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <ProgramActionMenuItems
                    Group={DropdownMenuGroup}
                    Item={DropdownMenuItem}
                    Separator={DropdownMenuSeparator}
                    isActive={active}
                    isBusy={isBusy}
                    onEdit={onEdit}
                    onToggleActive={onToggleActive}
                    onDelete={onDelete}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="pointer-events-none absolute inset-0 z-30 aspect-video bg-black/35" />
            <div className="relative z-20 flex aspect-video w-full items-center justify-center overflow-hidden">
              <ProgramIconAvatar
                iconKey={program.iconKey}
                className="h-full w-full rounded-none"
                iconClassName="h-24 w-24 md:h-28 md:w-28"
              />
            </div>
            <CardHeader>
              <CardTitle className="line-clamp-2" title={program.name}>
                {program.name}
              </CardTitle>
              <CardDescription className="line-clamp-2">
                {program.description}
              </CardDescription>
              <p className="text-xs text-muted-foreground">
                {t("programsGrid.updatedLabel", {
                  date: updatedAt,
                })}
              </p>
            </CardHeader>
          </Card>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-44"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ProgramActionMenuItems
          Group={ContextMenuGroup}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
          isActive={active}
          isBusy={isBusy}
          onEdit={onEdit}
          onToggleActive={onToggleActive}
          onDelete={onDelete}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ProgramsGrid({
  organizationId,
  organizationSlug,
  programs,
  busyProgramId,
  onEdit,
  onToggleActive,
  onDelete,
}: ProgramsGridProps) {
  const t = useTranslations("Programs");

  if (programs.length === 0) {
    return (
      <Empty className="mx-auto max-w-5xl border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shapes />
          </EmptyMedia>
          <EmptyTitle>{t("programsGrid.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("programsGrid.emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <ProgramCreateDialog
            organizationId={organizationId}
            organizationSlug={organizationSlug}
          >
            <Button>{t("page.createAction")}</Button>
          </ProgramCreateDialog>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {programs.map((program) => (
        <ProgramCard
          key={program._id}
          program={program}
          isBusy={busyProgramId === program._id}
          onEdit={() => onEdit(program._id)}
          onToggleActive={() => onToggleActive(program)}
          onDelete={() => onDelete(program)}
        />
      ))}
    </div>
  );
}
