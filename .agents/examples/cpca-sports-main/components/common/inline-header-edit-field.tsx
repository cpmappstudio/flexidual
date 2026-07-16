"use client";

import { useState } from "react";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InlineHeaderEditFieldProps {
  value: string;
  fallback: string;
  ariaLabel: string;
  disabled?: boolean;
  inputClassName?: string;
  onChange: (value: string) => void;
}

export function InlineHeaderEditField({
  value,
  fallback,
  ariaLabel,
  disabled = false,
  inputClassName,
  onChange,
}: InlineHeaderEditFieldProps) {
  const [isEditing, setIsEditing] = useState(false);

  const closeEditor = () => setIsEditing(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isEditing ? (
        <Input
          autoFocus
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={closeEditor}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              closeEditor();
            }
          }}
          placeholder={fallback}
          className={inputClassName}
        />
      ) : (
        <span>{value.trim() || fallback}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={disabled}
        onClick={() => setIsEditing(true)}
        aria-label={ariaLabel}
      >
        <PencilLine className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
