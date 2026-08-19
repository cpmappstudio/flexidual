import assert from "node:assert/strict";
import test from "node:test";

import { selectClassroomLayer } from "../components/classroom/classroom-layer-coordinator";

test("prioritizes extension decisions over lower-priority layers", () => {
  assert.equal(
    selectClassroomLayer({
      activeLayers: {
        "extension-decision": true,
        "share-permission": true,
        fullscreen: true,
      },
    }),
    "extension-decision",
  );
});

test("prioritizes conflicts before permissions and media prompts", () => {
  assert.equal(
    selectClassroomLayer({
      activeLayers: {
        "class-conflict": true,
        "share-permission": true,
        "enable-audio": true,
      },
    }),
    "class-conflict",
  );
});

test("shows only the selected preview layer", () => {
  assert.equal(
    selectClassroomLayer({
      activeLayers: { "extension-decision": true },
      isPreviewActive: true,
      previewLayer: "fullscreen",
    }),
    "fullscreen",
  );
});

test("suppresses live layers while previewing a control-only state", () => {
  assert.equal(
    selectClassroomLayer({
      activeLayers: { "extension-decision": true },
      isPreviewActive: true,
    }),
    null,
  );
});

test("suppresses automatic layers while a session action dialog is open", () => {
  assert.equal(
    selectClassroomLayer({
      activeLayers: { "extension-decision": true },
      isExternalDialogOpen: true,
    }),
    null,
  );
});
