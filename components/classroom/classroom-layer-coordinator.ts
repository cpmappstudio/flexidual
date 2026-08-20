export type ClassroomLayer =
  | "session-start"
  | "extension-decision"
  | "class-conflict"
  | "share-permission"
  | "recording-confirmation"
  | "companion"
  | "enable-audio"
  | "fullscreen";

const CLASSROOM_LAYER_PRIORITY: ClassroomLayer[] = [
  "session-start",
  "extension-decision",
  "class-conflict",
  "share-permission",
  "recording-confirmation",
  "companion",
  "enable-audio",
  "fullscreen",
];

export function selectClassroomLayer({
  activeLayers,
  isExternalDialogOpen = false,
  isPreviewActive = false,
  previewLayer = null,
}: {
  activeLayers: Partial<Record<ClassroomLayer, boolean>>;
  isExternalDialogOpen?: boolean;
  isPreviewActive?: boolean;
  previewLayer?: ClassroomLayer | null;
}) {
  if (isPreviewActive) return previewLayer;
  if (isExternalDialogOpen) return null;
  return CLASSROOM_LAYER_PRIORITY.find((layer) => activeLayers[layer]) ?? null;
}
