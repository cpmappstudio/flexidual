import assert from "node:assert/strict";
import test from "node:test";
import { calculateCourseProgress } from "../lib/course-progress";

test("counts every registered class across the course schedule", () => {
  const progress = calculateCourseProgress(
    [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "scheduled" },
      { status: "active" },
      { status: "cancelled" },
    ],
  );

  assert.deepEqual(progress, {
    totalClasses: 5,
    completedClasses: 3,
    pendingClasses: 2,
    percentage: 60,
  });
});

test("only end-class sessions count as completed", () => {
  assert.deepEqual(
    calculateCourseProgress(
      [
        { status: "scheduled" },
        { status: "active" },
      ],
    ),
    {
      totalClasses: 2,
      completedClasses: 0,
      pendingClasses: 2,
      percentage: 0,
    },
  );
});

test("returns zero progress when the course has no scheduled classes", () => {
  assert.deepEqual(calculateCourseProgress([]), {
    totalClasses: 0,
    completedClasses: 0,
    pendingClasses: 0,
    percentage: 0,
  });
});
