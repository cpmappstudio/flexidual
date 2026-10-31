import type { UIAppState } from "@excalidraw/excalidraw/types";

type PropertiesState = Pick<
  UIAppState,
  "viewModeEnabled" | "openDialog" | "editingTextElement" | "selectedElementIds"
> & {
  activeTool: Pick<UIAppState["activeTool"], "type">;
};

// Match 0.18.1's showSelectedShapeActions without importing its private implementation.
export function canShowWhiteboardProperties(
  state: PropertiesState,
  elements: readonly { id: string; isDeleted: boolean }[],
): boolean {
  if (state.viewModeEnabled || state.openDialog?.name === "elementLinkSelector")
    return false;
  if (
    state.activeTool.type !== "custom" &&
    (state.editingTextElement ||
      !["selection", "eraser", "hand", "laser"].includes(state.activeTool.type))
  )
    return true;
  if (!Object.keys(state.selectedElementIds).length) return false;
  return elements.some(
    (element) => !element.isDeleted && state.selectedElementIds[element.id],
  );
}
