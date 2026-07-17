/**
 * Settings Search Configuration
 *
 * This file defines all searchable settings items.
 * Each item maps to a specific settings page/section and includes
 * translation keys for localized search + optional extra keywords.
 */

import type { SettingsLabelKey } from "@/lib/navigation";

export type SettingsSearchItem = {
  /** Relative path from settings base (e.g., "appearance", "security") */
  path: string;
  /** Section within the page (e.g., "theme", "language") - used for anchoring */
  section: string;
  /** Translation namespace for title/description (e.g., "appearance.theme") */
  translationKey: string;
  /** Settings nav item labelKey - used to look up the icon */
  labelKey: SettingsLabelKey;
  /** Additional keywords for search (language-agnostic synonyms) */
  extraKeywords?: string[];
};

export const SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  // Appearance page items
  {
    path: "appearance",
    section: "theme",
    translationKey: "appearance.theme",
    labelKey: "appearance",
    extraKeywords: [
      "dark",
      "light",
      "mode",
      "oscuro",
      "claro",
      "modo",
      "night",
      "day",
      "noche",
      "día",
    ],
  },
  {
    path: "appearance",
    section: "colorScheme",
    translationKey: "appearance.colorScheme",
    labelKey: "appearance",
    extraKeywords: [
      "color",
      "palette",
      "scheme",
      "paleta",
      "colores",
      "theme",
      "tema",
      "zinc",
      "nature",
      "claude",
    ],
  },
  {
    path: "appearance",
    section: "language",
    translationKey: "appearance.language",
    labelKey: "appearance",
    extraKeywords: [
      "language",
      "idioma",
      "locale",
      "español",
      "english",
      "es",
      "en",
      "translation",
      "traducción",
    ],
  },
  // General page items (placeholder - expand as needed)
  {
    path: "",
    section: "appearance",
    translationKey: "general.appearance",
    labelKey: "general",
    extraKeywords: ["look", "visual", "aspecto"],
  },
  {
    path: "",
    section: "language",
    translationKey: "general.language",
    labelKey: "general",
    extraKeywords: ["language", "idioma", "locale"],
  },
  // Profile details subsections
  {
    path: "user-profile",
    section: "profileInfo",
    translationKey: "profile.profileInfo",
    labelKey: "profileSecurity",
    extraKeywords: [
      "name",
      "nombre",
      "picture",
      "foto",
      "avatar",
      "profile",
      "perfil",
      "info",
      "información",
    ],
  },
  {
    path: "user-profile",
    section: "email",
    translationKey: "profile.email",
    labelKey: "profileSecurity",
    extraKeywords: [
      "email",
      "correo",
      "mail",
      "address",
      "dirección",
      "contact",
      "contacto",
    ],
  },
  // Security subsections
  {
    path: "user-profile",
    section: "password",
    translationKey: "security.password",
    labelKey: "profileSecurity",
    extraKeywords: [
      "password",
      "contraseña",
      "pass",
      "change",
      "cambiar",
      "update",
      "actualizar",
      "reset",
      "restablecer",
    ],
  },
  {
    path: "user-profile",
    section: "devices",
    translationKey: "security.devices",
    labelKey: "profileSecurity",
    extraKeywords: [
      "devices",
      "dispositivos",
      "sessions",
      "sesiones",
      "active",
      "activos",
      "logout",
      "cerrar sesión",
      "signout",
    ],
  },
  // Billing (placeholder)
  {
    path: "billing",
    section: "billing",
    translationKey: "billing",
    labelKey: "billing",
    extraKeywords: [
      "payment",
      "pago",
      "plan",
      "subscription",
      "suscripción",
      "invoice",
      "factura",
      "card",
      "tarjeta",
    ],
  },
];
