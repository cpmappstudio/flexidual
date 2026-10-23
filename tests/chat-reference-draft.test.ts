import assert from "node:assert/strict";
import test from "node:test";
import {
  chatDraftText,
  chatDraftSlashQuery,
  updateChatDraft,
  sliceChatDraft,
} from "../lib/chat-reference-draft";
import { taskChatReference } from "../lib/chat-references";

test("drafts show only reference labels, including escaped characters", () => {
  const title = "Read [1] \\ www.example.com";
  const body = `See ${taskChatReference("task1", title)} today`;
  assert.equal(chatDraftText(body), `See ${title} today`);
  assert.equal(chatDraftText(""), "");
});

test("edits around references preserve their IDs and edits inside labels become plain text", () => {
  const first = taskChatReference("task1", "Math");
  const second = taskChatReference("task2", "Math");
  const body = `${first} ${second}`;
  for (const [next, start, end, caret, expected] of [
    ["Math Math!", 9, 9, 10, `${body}!`],
    ["Hello Math Math", 0, 0, 6, `Hello ${body}`],
    ["Math Math Math", 0, 0, 5, `Math ${body}`],
    ["Math", 0, 5, 0, second],
    ["Maps Math", 0, 4, 4, `Maps ${second}`],
    ["MatXh Math", 3, 3, 4, `MatXh ${second}`],
    ["", 0, 9, 0, ""],
  ] as const)
    assert.equal(updateChatDraft(body, next, { start, end }, caret), expected);
  assert.equal(
    updateChatDraft(body, "Math Math", { start: 0, end: 0 }, 0),
    body,
  );
});

test("slash positions map back to encoded references without triggering inside labels", () => {
  const reference = taskChatReference("task1", "Math");
  assert.deepEqual(chatDraftSlashQuery(`${reference} /Bio`, 9), {
    start: reference.length + 1,
    end: reference.length + 5,
    search: "Bio",
  });
  assert.equal(
    chatDraftSlashQuery(taskChatReference("task1", "Math /Bio"), 9),
    null,
  );
  assert.equal(chatDraftSlashQuery(`/ ${reference}`, 6), null);
});

test("copying whole references preserves them while partial labels remain plain text", () => {
  const reference = taskChatReference("task1", "Math");
  const body = `See ${reference} now`;
  assert.equal(sliceChatDraft(body, 0, 8), `See ${reference}`);
  assert.equal(sliceChatDraft(body, 5, 7), "at");
  assert.equal(sliceChatDraft(body, 4, 4), "");
});
