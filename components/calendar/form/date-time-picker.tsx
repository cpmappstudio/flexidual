"use client";

import { Input } from "@/components/ui/input";

interface DateTimePickerProps {
  field: {
    value: string;
    onChange: (value: string) => void;
  };
  timeZone: string;
}

export function DateTimePicker({ field, timeZone }: DateTimePickerProps) {
  return (
    <div className="grid gap-1.5">
      <Input
        type="datetime-local"
        step={300}
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        required
      />
      <span className="text-xs text-muted-foreground">{timeZone}</span>
    </div>
  );
}
