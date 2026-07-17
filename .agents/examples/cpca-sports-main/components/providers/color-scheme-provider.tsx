// ################################################################################
// # Check: 12/14/2025                                                            #
// ################################################################################
//
// COLOR SCHEME PROVIDER
// =====================
// This provider manages the active color scheme (e.g., zinc, nature, claude).
// It works together with ThemeScript to prevent flash of unstyled content.
//
// HOW TO ADD A NEW THEME:
// -----------------------
// 1. Add the theme name to COLOR_SCHEMES array in:
//    → lib/themes/index.ts
//    Example: Add "my-theme" to the array
//
// 2. Add the theme configuration to COLOR_SCHEME_REGISTRY in:
//    → lib/themes/index.ts
//    Example:
//    "my-theme": {
//      name: "my-theme",
//      label: "My Theme",
//      preview: { light: "oklch(...)", dark: "oklch(...)" },
//      font: `var(${FONT_VARIABLES.myFont})`, // optional
//    }
//
// 3. Add CSS variables for the theme in:
//    → app/globals.css
//    Example:
//    [data-theme="my-theme"] {
//      --background: ...;
//      --foreground: ...;
//      /* etc. */
//    }
//
// 4. (Optional) If using a new font, add it to:
//    → lib/fonts/index.ts
//    Import from next/font/google and add to fontVariables and FONT_VARIABLES
//

"use client";

import * as React from "react";
import { ColorScheme, COLOR_SCHEMES, DEFAULT_COLOR_SCHEME } from "@/lib/themes";

const STORAGE_KEY = "color-scheme";

function getStoredColorScheme(): ColorScheme | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ColorScheme | null;
    if (stored && COLOR_SCHEMES.includes(stored)) {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return null;
}

interface ColorSchemeContextValue {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
}

const ColorSchemeContext = React.createContext<ColorSchemeContextValue | null>(
  null,
);

export function useColorScheme() {
  const context = React.useContext(ColorSchemeContext);
  if (!context) {
    throw new Error("useColorScheme must be used within a ColorSchemeProvider");
  }
  return context;
}

interface ColorSchemeProviderProps {
  children: React.ReactNode;
  defaultScheme?: ColorScheme;
}

export function ColorSchemeProvider({
  children,
  defaultScheme = DEFAULT_COLOR_SCHEME,
}: ColorSchemeProviderProps) {
  // Always use defaultScheme for initial render to avoid hydration mismatch
  const [colorScheme, setColorSchemeState] =
    React.useState<ColorScheme>(defaultScheme);

  // Sync with localStorage after hydration to avoid mismatch
  React.useEffect(() => {
    const stored = getStoredColorScheme();
    if (stored && stored !== colorScheme) {
      setColorSchemeState(stored);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync data-theme attribute when provider re-mounts (e.g., locale change)
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", colorScheme);
  }, [colorScheme]);

  const setColorScheme = React.useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    localStorage.setItem(STORAGE_KEY, scheme);
    // Note: data-theme attribute is synced by useEffect when colorScheme changes
  }, []);

  const value = React.useMemo(
    () => ({ colorScheme, setColorScheme }),
    [colorScheme, setColorScheme],
  );

  return (
    <ColorSchemeContext.Provider value={value}>
      {children}
    </ColorSchemeContext.Provider>
  );
}
