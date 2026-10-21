import assert from "node:assert/strict";
import test from "node:test";
import {
  chatReferenceParts,
  chatSlashQuery,
  taskChatReference,
} from "../lib/chat-references";
import { containsChatLink } from "../lib/chat-attachments";

test("task references preserve escaped titles and surrounding text without treating them as external links", () => {
  const title = "Read [1] \\ www.example.com";
  const token = taskChatReference("abc123", title);
  assert.deepEqual(chatReferenceParts(`See ${token} now`), [
    { text: "See " },
    { text: token, taskId: "abc123", label: title },
    { text: " now" },
  ]);
  assert.equal(containsChatLink(token), false);
  assert.equal(containsChatLink(`${token} https://example.com`), true);
  assert.equal(
    chatReferenceParts("[Unsafe](javascript:alert(1))")[0].taskId,
    undefined,
  );
});

test("slash suggestions only replace text at the caret and do not activate inside URLs", () => {
  assert.deepEqual(chatSlashQuery("Remember /Math tomorrow", 14), {
    start: 9,
    end: 14,
    search: "Math",
  });
  assert.deepEqual(chatSlashQuery("/", 1), { start: 0, end: 1, search: "" });
  assert.equal(chatSlashQuery("https://example.com/path", 24), null);
  assert.equal(chatSlashQuery("hello/world", 11), null);
  const reference = taskChatReference("abc123", "Math / Science") + " done";
  assert.equal(chatSlashQuery(reference, reference.length), null);
});
