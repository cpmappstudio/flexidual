"use client";

import type { ComponentProps } from "react";
import { FieldLabel } from "@/components/ui/field";

export function RequiredFieldLabel({
  children,
  ...props
}: ComponentProps<typeof FieldLabel>) {
  return (
    <FieldLabel {...props}>
      <span>{children}</span>
      <span className="text-destructive" aria-hidden="true">
        *
      </span>
    </FieldLabel>
  );
}
