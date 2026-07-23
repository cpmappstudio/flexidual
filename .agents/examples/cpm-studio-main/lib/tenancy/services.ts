import type {
  PlatformCapabilityKey,
  PlatformModuleKey,
} from "@/lib/platform/capabilities";
import {
  isModuleEnabled,
  listImplementedModuleManifests,
} from "@/lib/modules/registry";

export type TenantOnboardingServiceKey = PlatformModuleKey;

export function getTenantServiceDefinitions() {
  return listImplementedModuleManifests().map((manifest) => ({
    key: manifest.key,
    icon: manifest.icon,
    iconColor: manifest.iconColor,
  }));
}

export function hasTenantOnboardingServices() {
  return getTenantServiceDefinitions().length > 0;
}

export function isTenantOnboardingRequired(
  enabledCapabilityKeys: readonly PlatformCapabilityKey[],
) {
  return hasTenantOnboardingServices() && enabledCapabilityKeys.length === 0;
}

export function getInitialTenantOnboardingServiceKeys(
  enabledCapabilityKeys: readonly PlatformCapabilityKey[],
) {
  return listImplementedModuleManifests()
    .filter((manifest) => isModuleEnabled(manifest, enabledCapabilityKeys))
    .map((manifest) => manifest.key);
}
