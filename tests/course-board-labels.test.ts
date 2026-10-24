import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const locales = [
  ["en", "Board"],
  ["es", "Pizarra"],
  ["pt-BR", "Quadro"],
] as const;

let expectedKeys: string[] | undefined;
for (const [locale, label] of locales) {
  test(`the teacher Board has consistent ${locale} labels without renaming persisted identifiers`, () => {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../messages/${locale}.json`, import.meta.url),
        "utf8",
      ),
    );
    const labels = messages.courseNotebook as Record<string, string>;
    assert.ok(
      labels,
      "Keep the existing translation namespace for all consumers",
    );
    assert.equal(labels.tab, label);
    assert.doesNotMatch(
      Object.values(labels).join(" "),
      /\b(notebook|cuaderno|caderno)\b/i,
    );
    for (const key of [
      "archive",
      "restore",
      "archived",
      "retry",
      "operationFailed",
    ]) {
      assert.match(labels[key], new RegExp(label, "i"), key);
    }
    expectedKeys ??= Object.keys(labels).sort();
    assert.deepEqual(Object.keys(labels).sort(), expectedKeys);
  });
}
