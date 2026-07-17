"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { useColorScheme } from "@/components/providers/color-scheme-provider";
import { COLOR_SCHEMES, COLOR_SCHEME_REGISTRY } from "@/lib/themes";
import { Button } from "@/components/ui/button";

export function ThemeSelector() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Avoid hydration mismatch by only using resolvedTheme after mount
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Use a consistent value for SSR, then switch to actual theme after hydration
  const isDark = mounted ? resolvedTheme === "dark" : false;

  return (
    <div className="flex flex-wrap gap-3">
      {COLOR_SCHEMES.map((scheme) => {
        const config = COLOR_SCHEME_REGISTRY[scheme];
        const isActive = colorScheme === scheme;
        const previewColor = isDark
          ? config.preview.dark
          : config.preview.light;

        return (
          <Button
            key={scheme}
            onClick={() => setColorScheme(scheme)}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
              isActive
                ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "border-muted hover:border-muted-foreground",
            )}
            style={{ backgroundColor: previewColor }}
            title={config.label}
          >
            {isActive && (
              <CheckIcon className="h-5 w-5 text-primary-foreground" />
            )}
          </Button>
        );
      })}
    </div>
  );
}
