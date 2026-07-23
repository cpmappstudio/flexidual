"use client";

import type { Id } from "@/convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_CAMPUS_SELECT_VALUE = "__no_campus__";

export type TenantCampusSelectOption = {
  _id: Id<"campuses">;
  name: string;
};

export function TenantCampusSelect({
  ariaLabel,
  campuses,
  className,
  disabled,
  emptyOptionLabel,
  onValueChange,
  placeholder,
  triggerId,
  value,
}: {
  ariaLabel?: string;
  campuses: TenantCampusSelectOption[];
  className?: string;
  disabled?: boolean;
  emptyOptionLabel?: string;
  onValueChange: (campusId: Id<"campuses"> | "") => void;
  placeholder?: string;
  triggerId?: string;
  value: Id<"campuses"> | "";
}) {
  const selectValue =
    value || (emptyOptionLabel ? NO_CAMPUS_SELECT_VALUE : undefined);

  return (
    <Select
      value={selectValue}
      disabled={disabled}
      onValueChange={(nextValue) => {
        onValueChange(
          nextValue === NO_CAMPUS_SELECT_VALUE
            ? ""
            : (nextValue as Id<"campuses">),
        );
      }}
    >
      <SelectTrigger
        id={triggerId}
        aria-label={ariaLabel}
        className={className ?? "w-full"}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {emptyOptionLabel ? (
            <SelectItem value={NO_CAMPUS_SELECT_VALUE}>
              {emptyOptionLabel}
            </SelectItem>
          ) : null}
          {campuses.map((campus) => (
            <SelectItem key={campus._id} value={campus._id}>
              {campus.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
