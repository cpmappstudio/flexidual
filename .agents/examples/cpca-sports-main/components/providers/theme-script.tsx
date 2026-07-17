// ################################################################################
// # Check: 12/14/2025                                                            #
// ################################################################################

import { COLOR_SCHEMES, DEFAULT_COLOR_SCHEME } from "@/lib/themes";

export function ThemeScript() {
  const scriptContent = `
    (function() {
      var storageKey = "color-scheme";
      var defaultScheme = "${DEFAULT_COLOR_SCHEME}";
      var validSchemes = ${JSON.stringify(COLOR_SCHEMES)};

      try {
        var stored = localStorage.getItem(storageKey);
        var scheme = (stored && validSchemes.indexOf(stored) !== -1) ? stored : defaultScheme;
        document.documentElement.setAttribute("data-theme", scheme);
      } catch (e) {
        document.documentElement.setAttribute("data-theme", defaultScheme);
      }
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: scriptContent }}
      suppressHydrationWarning
    />
  );
}
