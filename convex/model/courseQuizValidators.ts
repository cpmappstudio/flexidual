import { v } from "convex/values";

export const courseTaskKindValidator = v.union(
  v.literal("files"),
  v.literal("quiz"),
);

export const courseQuizConfigurationValidator = v.object({
  durationMinutes: v.number(),
  questionCount: v.optional(v.number()),
  shuffleQuestions: v.optional(v.boolean()),
  firstStartedAt: v.optional(v.number()),
  closeScheduledId: v.optional(v.id("_scheduled_functions")),
  closedAt: v.optional(v.number()),
});

export const courseQuizAttemptValidator = v.object({
  startedAt: v.number(),
  timeLimitAt: v.number(),
  questionOrder: v.optional(v.array(v.id("courseQuizQuestions"))),
  expirationScheduledId: v.optional(v.id("_scheduled_functions")),
  submissionReason: v.optional(
    v.union(
      v.literal("manual"),
      v.literal("time_limit"),
      v.literal("quiz_close"),
    ),
  ),
});

const questionFields = {
  taskId: v.id("courseTasks"),
  order: v.number(),
  prompt: v.string(),
  maxPoints: v.number(),
};

export const courseQuizChoiceQuestionValidator = v.object({
  ...questionFields,
  kind: v.literal("single_choice"),
  options: v.array(v.object({ id: v.string(), label: v.string() })),
  correctOptionId: v.string(),
});

const multipleChoiceQuestionValidator = courseQuizChoiceQuestionValidator
  .omit("kind", "correctOptionId")
  .extend({
    kind: v.literal("multiple_choice"),
    correctOptionIds: v.array(v.string()),
  });

export const courseQuizTextQuestionValidator = v.object({
  ...questionFields,
  kind: v.literal("text"),
});

export const courseQuizQuestionValidator = v.union(
  courseQuizChoiceQuestionValidator,
  multipleChoiceQuestionValidator,
  courseQuizTextQuestionValidator,
);

export const courseQuizQuestionInputValidator = v.union(
  courseQuizChoiceQuestionValidator.omit("taskId", "order"),
  multipleChoiceQuestionValidator.omit("taskId", "order"),
  courseQuizTextQuestionValidator.omit("taskId", "order"),
);

export const courseQuizQuestionEditValidator = v.union(
  ...courseQuizQuestionInputValidator.members.map((question) =>
    question.extend({ _id: v.optional(v.id("courseQuizQuestions")) }),
  ),
);

export const courseQuizQuestionViewValidator = v.union(
  courseQuizChoiceQuestionValidator.omit("taskId", "correctOptionId").extend({
    _id: v.id("courseQuizQuestions"),
    correctOptionId: v.optional(v.string()),
  }),
  multipleChoiceQuestionValidator.omit("taskId", "correctOptionIds").extend({
    _id: v.id("courseQuizQuestions"),
    correctOptionIds: v.optional(v.array(v.string())),
  }),
  courseQuizTextQuestionValidator
    .omit("taskId")
    .extend({ _id: v.id("courseQuizQuestions") }),
);

export const courseQuizAnswerValidator = v.object({
  taskId: v.id("courseTasks"),
  recipientId: v.id("courseTaskRecipients"),
  questionId: v.id("courseQuizQuestions"),
  answer: v.union(
    v.object({
      kind: v.literal("single_choice"),
      optionId: v.union(v.string(), v.null()),
    }),
    v.object({
      kind: v.literal("multiple_choice"),
      optionIds: v.array(v.string()),
    }),
    v.object({ kind: v.literal("text"), text: v.string() }),
  ),
  version: v.number(),
  updatedAt: v.number(),
});

export const courseQuizScoreValidator = v.object({
  questionId: v.id("courseQuizQuestions"),
  points: v.union(v.number(), v.null()),
});

export const courseQuizAnswerUpdateValidator = courseQuizAnswerValidator
  .pick("questionId", "answer")
  .extend({ expectedVersion: v.number() });

export const courseQuizAnswerViewValidator = courseQuizAnswerValidator.pick(
  "questionId",
  "answer",
  "version",
);
