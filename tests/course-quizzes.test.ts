import assert from "node:assert/strict";
import test from "node:test";
import {
  areQuizQuestionsValid,
  getQuizQuestionIssue,
  type QuizQuestionInput,
} from "../lib/course-quizzes";

const single: QuizQuestionInput = {
  kind: "single_choice",
  prompt: "Choose",
  maxPoints: 1,
  options: [
    { id: "a", label: "One" },
    { id: "b", label: "Two" },
  ],
  correctOptionId: "a",
};
const multiple: QuizQuestionInput = {
  kind: "multiple_choice",
  prompt: "Choose all",
  maxPoints: 2,
  options: single.options,
  correctOptionIds: ["a", "b"],
};

test("question diagnostics and publication enforce the same existing constraints", () => {
  for (const question of [
    single,
    multiple,
    { kind: "text", prompt: "Explain", maxPoints: 0.25 } as const,
  ]) {
    assert.equal(getQuizQuestionIssue(question, 2), undefined);
    assert.equal(areQuizQuestionsValid([question], 2), true);
  }
  const invalid: [QuizQuestionInput, string][] = [
    [{ ...single, prompt: " " }, "prompt"],
    [{ ...single, prompt: "x".repeat(10_001) }, "prompt"],
    ...[0, -1, NaN, Infinity, 1.001, 1_000_001].map(
      (maxPoints): [QuizQuestionInput, string] => [
        { ...single, maxPoints },
        "points",
      ],
    ),
    [{ ...single, options: [single.options[0]] }, "options"],
    [{ ...single, options: [single.options[0], single.options[0]] }, "options"],
    [
      { ...single, options: [{ id: " ", label: "One" }, single.options[1]] },
      "option",
    ],
    [
      { ...single, options: [{ id: "a", label: " " }, single.options[1]] },
      "option",
    ],
    [{ ...single, correctOptionId: "missing" }, "options"],
    [{ ...multiple, correctOptionIds: [] }, "options"],
    [{ ...multiple, correctOptionIds: ["a", "a"] }, "options"],
    [{ ...multiple, correctOptionIds: ["a", "missing"] }, "options"],
  ];
  for (const [question, field] of invalid) {
    assert.equal(getQuizQuestionIssue(question, 2)?.field, field);
    assert.equal(areQuizQuestionsValid([question], 2), false);
  }
});

test("whole-quiz limits and institutional precision remain independent of field diagnostics", () => {
  assert.equal(areQuizQuestionsValid([], 2), false);
  assert.equal(
    areQuizQuestionsValid(
      Array.from({ length: 50 }, () => single),
      2,
    ),
    true,
  );
  assert.equal(
    areQuizQuestionsValid(
      Array.from({ length: 51 }, () => single),
      2,
    ),
    false,
  );
  assert.equal(
    areQuizQuestionsValid(
      [
        { ...single, maxPoints: 500_000 },
        { ...multiple, maxPoints: 500_001 },
      ],
      2,
    ),
    false,
  );
  assert.equal(
    areQuizQuestionsValid(
      [
        { ...single, maxPoints: 0.1 },
        { ...multiple, maxPoints: 0.2 },
      ],
      2,
    ),
    true,
  );
  assert.equal(
    areQuizQuestionsValid([{ ...single, maxPoints: 1.5 }], 0),
    false,
  );
  assert.equal(areQuizQuestionsValid([{ ...single, maxPoints: 1.5 }], 1), true);
});
