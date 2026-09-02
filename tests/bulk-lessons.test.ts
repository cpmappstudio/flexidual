import assert from "node:assert/strict";
import test from "node:test";

import { parseBulkLessons } from "../lib/bulk-lessons";

test("parses the Teachers App bulk lesson format", () => {
  assert.deepEqual(
    parseBulkLessons(
      [
        "Lesson 1 – Letter recognition",
        "Lesson 2 - Beginning sounds",
        "---",
        "Lesson 3 — Oral evaluation – review",
        "Lesson 4",
      ].join("\n"),
    ),
    {
      lessons: [
        { title: "Lesson 1", description: "Letter recognition" },
        { title: "Lesson 2", description: "Beginning sounds" },
        { title: "Lesson 3", description: "Oral evaluation – review" },
        { title: "Lesson 4" },
      ],
      invalidLines: [],
    },
  );
});

test("ignores blank lines and reports lines without a title", () => {
  assert.deepEqual(parseBulkLessons("\n– Missing title\nValid lesson\n---\n"), {
    lessons: [{ title: "Valid lesson" }],
    invalidLines: [2],
  });
});
