import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

test("application mutations cannot bypass transactional dashboard projections", () => {
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "_generated") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (
        !path.endsWith(".ts") ||
        path.endsWith(".test.ts") ||
        path === join("convex", "functions.ts")
      )
        continue;
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const node of source.statements) {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteral(node.moduleSpecifier) ||
          !node.moduleSpecifier.text.endsWith("_generated/server")
        )
          continue;
        const bindings = node.importClause?.namedBindings;
        if (
          !bindings ||
          !ts.isNamedImports(bindings) ||
          node.importClause?.isTypeOnly
        )
          continue;
        for (const specifier of bindings.elements) {
          if (specifier.isTypeOnly) continue;
          assert.ok(
            !["mutation", "internalMutation"].includes(
              (specifier.propertyName ?? specifier.name).text,
            ),
            `${path}: register mutations through the shared functions boundary`,
          );
        }
      }
    }
  };
  visit("convex");
});
