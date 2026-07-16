"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePopoverProps {
  dateRange: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  placeholder: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  disabled?: (date: Date) => boolean;
  displayFormat?: "day" | "month";
}

export function DateRangePopover({
  dateRange,
  onSelect,
  placeholder,
  className,
  variant = "outline",
  disabled,
  displayFormat = "day",
}: DateRangePopoverProps) {
  const fromText = dateRange?.from
    ? format(
        dateRange.from,
        displayFormat === "month" ? "LLL yyyy" : "LLL dd, y",
      )
    : null;
  const toText = dateRange?.to
    ? format(dateRange.to, displayFormat === "month" ? "LLL yyyy" : "LLL dd, y")
    : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={variant} className={className}>
          <CalendarIcon />
          {fromText ? (
            toText ? (
              <>
                {fromText} - {toText}
              </>
            ) : (
              fromText
            )
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={onSelect}
          numberOfMonths={2}
          captionLayout="dropdown"
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
