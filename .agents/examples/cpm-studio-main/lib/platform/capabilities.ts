export const platformModuleRegistry = [
  {
    key: "dismissal",
    name: "Dismissal",
  },
  {
    key: "academics",
    name: "Academics",
  },
  {
    key: "library",
    name: "Library",
  },
  {
    key: "teaching",
    name: "Teaching",
  },
  {
    key: "billing",
    name: "Billing",
  },
  {
    key: "liveClasses",
    name: "Flexidual",
  },
] as const;

export const platformModuleKeys = platformModuleRegistry.map(
  (module) => module.key,
) as readonly (typeof platformModuleRegistry)[number]["key"][];

export type PlatformModuleKey = (typeof platformModuleRegistry)[number]["key"];

export const platformCapabilityRegistry = [
  {
    key: "dismissal.core",
    moduleKey: "dismissal",
    name: "Dismissal",
    description: "Operational dismissal flow for vehicles, operators, students, and live queueing.",
  },
  {
    key: "academics.core",
    moduleKey: "academics",
    name: "Academics",
    description: "Academic programs, courses, periods, and institutional academic structure.",
  },
  {
    key: "academics.grading",
    moduleKey: "academics",
    name: "Final grading",
    description: "Final grades, class assignment, and teacher/student grade visibility.",
  },
  {
    key: "library.core",
    moduleKey: "library",
    name: "Library",
    description: "Digital library collections and document access for enrolled users.",
  },
  {
    key: "teaching.curriculum",
    moduleKey: "teaching",
    name: "Teaching curriculum",
    description: "Curriculum tracking, lessons, and teacher planning workflows.",
  },
  {
    key: "teaching.evidence",
    moduleKey: "teaching",
    name: "Teaching evidence",
    description: "Evidence uploads and class progress reporting for teachers.",
  },
  {
    key: "billing.core",
    moduleKey: "billing",
    name: "Billing",
    description: "Charges, recurring payments, and family billing workflows.",
  },
  {
    key: "liveClasses.core",
    moduleKey: "liveClasses",
    name: "Flexidual",
    description: "LiveKit-based live classes, attendance, and session participation.",
  },
] as const satisfies ReadonlyArray<{
  key: string;
  moduleKey: PlatformModuleKey;
  name: string;
  description: string;
}>;

export type PlatformCapabilityKey =
  (typeof platformCapabilityRegistry)[number]["key"];

export const capabilitySources = [
  "manual",
  "plan",
  "trial",
  "override",
] as const;

export type CapabilitySource = (typeof capabilitySources)[number];

export function getPlatformModuleDefinition(key: PlatformModuleKey) {
  return platformModuleRegistry.find((module) => module.key === key) ?? null;
}

export function getPlatformCapabilityDefinition(
  key: PlatformCapabilityKey,
) {
  return platformCapabilityRegistry.find((capability) => capability.key === key) ?? null;
}

export function getEnabledModuleKeysFromCapabilities(
  capabilityKeys: readonly PlatformCapabilityKey[],
) {
  return platformModuleKeys.filter((moduleKey) =>
    capabilityKeys.some((capabilityKey) => {
      const capability = getPlatformCapabilityDefinition(capabilityKey);
      return capability?.moduleKey === moduleKey;
    }),
  );
}
