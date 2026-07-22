"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
export function TimeZoneInput(
  props: Omit<React.ComponentProps<typeof Input>, "list">,
) {
  const listId = React.useId();
  const timeZones = React.useMemo(
    () => Intl.supportedValuesOf?.("timeZone") ?? [],
    [],
  );

  return (
    <>
      <Input {...props} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {timeZones.map((timeZone) => (
          <option key={timeZone} value={timeZone} />
        ))}
      </datalist>
    </>
  );
}
