import type {
  PlatformCapabilityKey,
  PlatformModuleKey,
} from "@/lib/platform/capabilities";
import { platformModuleKeys } from "@/lib/platform/capabilities";
import { ROUTES } from "@/lib/navigation/routes";
import type {
  ModuleManifest,
  ModuleNavigationContext,
  ModuleNavigationItem,
  ModuleSurface,
} from "@/lib/modules/types";
import {
  Car01Icon,
  FolderManagementIcon,
  Invoice03Icon,
  TeacherIcon,
  TeachingIcon,
} from "@hugeicons/core-free-icons";

function createModuleManifest(args: {
  key: PlatformModuleKey;
  status: ModuleManifest["status"];
  surfaces: readonly ModuleSurface[];
  routePrefix: string;
  icon: ModuleManifest["icon"];
  iconColor: string;
  requiredCapabilities: readonly PlatformCapabilityKey[];
  navigation?: (
    ctx: ModuleNavigationContext,
    surface: ModuleSurface,
  ) => readonly ModuleNavigationItem[];
}): ModuleManifest {
  return {
    ...args,
    navigation: args.navigation ?? (() => []),
  };
}

export const moduleManifestRegistry = {
  dismissal: createModuleManifest({
    key: "dismissal",
    status: "planned",
    surfaces: [],
    routePrefix: "dismissal",
    icon: Car01Icon,
    iconColor: "oklch(0.4461 0.1378 298.1)",
    requiredCapabilities: ["dismissal.core"],
  }),
  academics: createModuleManifest({
    key: "academics",
    status: "planned",
    surfaces: [],
    routePrefix: "academics",
    icon: FolderManagementIcon,
    iconColor: "oklch(0.6387 0.1418 21.88)",
    requiredCapabilities: ["academics.core", "academics.grading"],
  }),
  library: createModuleManifest({
    key: "library",
    status: "planned",
    surfaces: [],
    routePrefix: "library",
    icon: FolderManagementIcon,
    iconColor: "oklch(0.5931 0.1117 181.91)",
    requiredCapabilities: ["library.core"],
  }),
  teaching: createModuleManifest({
    key: "teaching",
    status: "planned",
    surfaces: [],
    routePrefix: "teaching",
    icon: TeacherIcon,
    iconColor: "oklch(0.3884 0.1035 287.88)",
    requiredCapabilities: ["teaching.curriculum", "teaching.evidence"],
  }),
  billing: createModuleManifest({
    key: "billing",
    status: "planned",
    surfaces: [],
    routePrefix: "billing",
    icon: Invoice03Icon,
    iconColor: "oklch(0.878 0.166 93.959)",
    requiredCapabilities: ["billing.core"],
  }),
  liveClasses: createModuleManifest({
    key: "liveClasses",
    status: "implemented",
    surfaces: ["campus"],
    routePrefix: "live-classes",
    icon: TeachingIcon,
    iconColor: "oklch(0.7251 0.1734 54.0757)",
    requiredCapabilities: ["liveClasses.core"],
    navigation: (ctx, surface) => {
      if (surface !== "campus" || !ctx.campusSlug) {
        return [];
      }

      const rootHref = getCampusModuleHref({
        tenantSlug: ctx.tenantSlug,
        campusSlug: ctx.campusSlug,
        routePrefix: "live-classes",
      });

      return [
        {
          label: ctx.getModuleLabel("liveClasses"),
          href: rootHref,
          items: [
            {
              label: ctx.getModuleNavigationLabel("liveClasses", "calendar"),
              href: ROUTES.tenant.campuses.liveClasses.calendar(
                ctx.tenantSlug,
                ctx.campusSlug,
              ),
            },
            {
              label: ctx.getModuleNavigationLabel("liveClasses", "courses"),
              href: ROUTES.tenant.campuses.liveClasses.courses(
                ctx.tenantSlug,
                ctx.campusSlug,
              ),
            },
          ],
        },
      ];
    },
  }),
} as const satisfies Record<PlatformModuleKey, ModuleManifest>;

export function getTenantModuleHref(_tenantSlug: string, routePrefix: string) {
  return `/${routePrefix}`;
}

export function getCampusModuleHref(args: {
  tenantSlug: string;
  campusSlug: string;
  routePrefix: string;
}) {
  return `${ROUTES.tenant.campuses.detail(args.tenantSlug, args.campusSlug)}/${args.routePrefix}`;
}

export function isModuleEnabled(
  manifest: ModuleManifest,
  enabledCapabilityKeys: readonly PlatformCapabilityKey[],
) {
  return manifest.requiredCapabilities.some((capabilityKey) =>
    enabledCapabilityKeys.includes(capabilityKey),
  );
}

export function isModuleImplemented(manifest: ModuleManifest) {
  return manifest.status === "implemented";
}

export function supportsModuleSurface(
  manifest: ModuleManifest,
  surface: ModuleSurface,
) {
  return manifest.surfaces.includes(surface);
}

export function listEnabledModuleManifests(
  enabledCapabilityKeys: readonly PlatformCapabilityKey[],
) {
  return platformModuleKeys
    .map((moduleKey) => moduleManifestRegistry[moduleKey])
    .filter((manifest) => isModuleEnabled(manifest, enabledCapabilityKeys));
}

export function listImplementedModuleManifests() {
  return platformModuleKeys
    .map((moduleKey) => moduleManifestRegistry[moduleKey])
    .filter((manifest) => isModuleImplemented(manifest));
}

export function buildTenantShellNavigation(args: {
  rootLabel: string;
  coreEntries?: readonly ModuleNavigationItem[];
  moduleContext: ModuleNavigationContext;
}) {
  return [
    {
      label: args.rootLabel,
      href: ROUTES.tenant.root(args.moduleContext.tenantSlug),
    },
    ...(args.coreEntries ?? []),
    ...listEnabledModuleManifests(args.moduleContext.enabledCapabilityKeys)
      .filter(
        (manifest) =>
          isModuleImplemented(manifest) &&
          supportsModuleSurface(manifest, "tenant"),
      )
      .flatMap((manifest) =>
        manifest.navigation(args.moduleContext, "tenant").map((item) => ({
          ...item,
          icon: item.icon ?? manifest.icon,
        })),
      ),
  ];
}

export function buildCampusShellNavigation(args: {
  coreEntries?: readonly ModuleNavigationItem[];
  moduleContext: ModuleNavigationContext & { campusSlug: string };
}) {
  return [
    ...(args.coreEntries ?? []),
    ...listEnabledModuleManifests(args.moduleContext.enabledCapabilityKeys)
      .filter(
        (manifest) =>
          isModuleImplemented(manifest) &&
          supportsModuleSurface(manifest, "campus"),
      )
      .flatMap((manifest) =>
        manifest.navigation(args.moduleContext, "campus").map((item) => ({
          ...item,
          icon: item.icon ?? manifest.icon,
        })),
      ),
  ];
}
