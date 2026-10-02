export function getFullscreenPortalContainer(
  container?: Element | DocumentFragment | null,
) {
  if (container) return container;
  if (typeof document === "undefined") return undefined;
  return document.fullscreenElement ?? undefined;
}
