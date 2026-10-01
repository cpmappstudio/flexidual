import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TASK_FILE_BYTES,
  MAX_TASK_SUBMISSION_FILES,
  MAX_TASK_TOTAL_BYTES,
  isValidTaskFile,
  taskFileContentType,
  validTaskFileSet,
} from "../lib/course-task-files";

test("task file policy accepts current classroom formats and rejects legacy or macro-enabled files", () => {
  for (const name of [
    "photo.jpg",
    "photo.png",
    "photo.webp",
    "work.pdf",
    "essay.docx",
    "slides.pptx",
  ]) {
    const type = taskFileContentType(name);
    assert.ok(type);
    assert.equal(isValidTaskFile({ name, type, size: 1024 }), true);
  }
  for (const name of [
    "old.doc",
    "old.ppt",
    "macro.docm",
    "macro.pptm",
    "video.mp4",
  ]) {
    assert.equal(taskFileContentType(name), undefined);
  }
  assert.equal(
    isValidTaskFile({
      name: "large.pdf",
      type: "application/pdf",
      size: MAX_TASK_FILE_BYTES + 1,
    }),
    false,
  );
});

test("task file set checks count and total size independently", () => {
  assert.equal(
    validTaskFileSet(
      Array.from({ length: MAX_TASK_SUBMISSION_FILES }, () => ({ size: 1 })),
      MAX_TASK_SUBMISSION_FILES,
    ),
    true,
  );
  assert.equal(
    validTaskFileSet(
      Array.from({ length: MAX_TASK_SUBMISSION_FILES + 1 }, () => ({
        size: 1,
      })),
      MAX_TASK_SUBMISSION_FILES,
    ),
    false,
  );
  assert.equal(
    validTaskFileSet(
      [{ size: MAX_TASK_TOTAL_BYTES }, { size: 1 }],
      MAX_TASK_SUBMISSION_FILES,
    ),
    false,
  );
});
