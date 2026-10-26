"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePeopleDirectory } from "@/hooks/use-people-directory";
import { Button } from "@/components/ui/button";
import { Combobox as CampusCombobox } from "@/components/ui/combobox";
import {
  Combobox,
  ComboboxValue,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
  useComboboxAnchor,
} from "@/components/ui/combobox-multiple";

export type BroadcastProfessor = { _id: Id<"users">; fullName: string };

export function BroadcastProfessorPicker({
  schoolId,
  campusId,
  mode,
  value,
  onChange,
  disabled = false,
}: {
  schoolId: Id<"schools">;
  campusId?: Id<"campuses">;
  mode: "private" | "school";
  value: BroadcastProfessor[];
  onChange: (value: BroadcastProfessor[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("classroom.broadcasts");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [directoryCampusId, setDirectoryCampusId] = useState(campusId);
  const campuses = useQuery(
    api.campuses.list,
    mode === "school" ? { schoolId, isActive: true } : "skip",
  );
  const selectedCampus =
    mode === "private" ? campusId : (directoryCampusId ?? campuses?.[0]?._id);
  const directory = usePeopleDirectory(
    open && !disabled && selectedCampus
      ? { campusId: selectedCampus, role: "teacher" }
      : undefined,
  );
  const setFilters = directory.server.onColumnFiltersChange;
  useEffect(() => {
    setFilters([
      { id: "isActive", value: ["active"] },
      { id: "search", value: search },
    ]);
  }, [search, setFilters]);
  const anchor = useComboboxAnchor();
  const labels = new Map([...directory.data, ...value].map((p) => [p._id, p]));
  return (
    <div className="grid gap-2">
      {mode === "school" && (
        <>
          <CampusCombobox
            options={
              campuses?.map((campus) => ({
                value: campus._id,
                label: campus.name,
              })) ?? []
            }
            value={selectedCampus}
            onValueChange={(id) => {
              setDirectoryCampusId(id as Id<"campuses">);
              setSearch("");
            }}
            disabled={disabled}
            ariaLabel={t("campusFilter")}
            placeholder={t("campus")}
            deselectOnReselect={false}
          />
          <p className="text-sm text-muted-foreground">
            {t("multiCampusHint")}
          </p>
        </>
      )}
      <Combobox
        multiple
        items={directory.data.map((p) => p._id)}
        value={value.map((p) => p._id)}
        filter={null}
        itemToStringLabel={(id) => labels.get(id)?.fullName ?? ""}
        inputValue={search}
        onInputValueChange={setSearch}
        onOpenChange={(next) => {
          if (next)
            setPortalContainer(
              anchor.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
            );
          setOpen(next);
        }}
        onValueChange={(ids) =>
          onChange(ids.flatMap((id) => labels.get(id) ?? []))
        }
        disabled={disabled || !selectedCampus}
      >
        <ComboboxChips ref={anchor} className="w-full bg-background">
          <ComboboxValue>
            {() =>
              value.map((person) => (
                <ComboboxChip
                  key={person._id}
                  removeLabel={t("removeProfessor", { name: person.fullName })}
                >
                  {person.fullName}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            aria-label={t("professors")}
            placeholder={t("searchProfessors")}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor} portalContainer={portalContainer}>
          <ComboboxEmpty>
            {directory.server.isLoading || !directory.ready
              ? common("loading")
              : common("noResults")}
          </ComboboxEmpty>
          <ComboboxList>
            {(id: Id<"users">) => (
              <ComboboxItem key={id} value={id}>
                {labels.get(id)?.fullName}
              </ComboboxItem>
            )}
          </ComboboxList>
          <div className="flex justify-between gap-2 border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={
                directory.server.pageIndex === 0 || directory.server.isLoading
              }
              onClick={directory.server.onPrevious}
            >
              {common("previous")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!directory.server.hasNext || directory.server.isLoading}
              onClick={directory.server.onNext}
            >
              {common("next")}
            </Button>
          </div>
          {directory.preparationFailed && (
            <Button
              type="button"
              variant="ghost"
              onClick={directory.initialize}
            >
              {t("retry")}
            </Button>
          )}
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
