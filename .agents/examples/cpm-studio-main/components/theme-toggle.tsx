"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ThemeToggleProps = {
  labels: {
    theme: string;
    light: string;
    dark: string;
    system: string;
  };
};

export function ThemeToggle({ labels }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const value = mounted ? (theme ?? "system") : "system";

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(nextTheme) => {
        if (nextTheme) {
          setTheme(nextTheme);
        }
      }}
      aria-label={labels.theme}
    >
      <ToggleGroupItem value="system" aria-label={labels.system}>
        <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} />
      </ToggleGroupItem>
      <ToggleGroupItem value="light" aria-label={labels.light}>
        <HugeiconsIcon icon={Sun03Icon} strokeWidth={2} />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label={labels.dark}>
        <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
