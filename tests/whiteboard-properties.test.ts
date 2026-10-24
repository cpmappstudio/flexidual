import assert from "node:assert/strict";
import test from "node:test";
import { canShowWhiteboardProperties } from "../components/whiteboard/whiteboard-properties";

const state = (
  type: Parameters<
    typeof canShowWhiteboardProperties
  >[0]["activeTool"]["type"] = "selection",
) => ({
  viewModeEnabled: false,
  openDialog: null,
  editingTextElement: null,
  selectedElementIds: {},
  activeTool: { type },
});

test("non-styling tools have no properties without a selected object", () => {
  for (const type of [
    "selection",
    "hand",
    "eraser",
    "laser",
    "custom",
  ] as const)
    assert.equal(canShowWhiteboardProperties(state(type), []), false, type);
});
test("drawing tools expose their native properties", () => {
  for (const type of [
    "freedraw",
    "rectangle",
    "ellipse",
    "diamond",
    "arrow",
    "line",
    "text",
    "image",
    "frame",
  ] as const)
    assert.equal(canShowWhiteboardProperties(state(type), []), true, type);
});
test("selection exposes properties only for a visible selected object", () => {
  const selected = {
    ...state(),
    selectedElementIds: { object: true as const },
  };
  assert.equal(
    canShowWhiteboardProperties(selected, [{ id: "object", isDeleted: false }]),
    true,
  );
  assert.equal(
    canShowWhiteboardProperties(selected, [{ id: "object", isDeleted: true }]),
    false,
  );
  assert.equal(canShowWhiteboardProperties(selected, []), false);
});
test("read-only and link selection never expose editing properties", () => {
  assert.equal(
    canShowWhiteboardProperties(
      { ...state("freedraw"), viewModeEnabled: true },
      [],
    ),
    false,
  );
  assert.equal(
    canShowWhiteboardProperties(
      {
        ...state("freedraw"),
        openDialog: { name: "elementLinkSelector", sourceElementId: "object" },
      },
      [],
    ),
    false,
  );
});
