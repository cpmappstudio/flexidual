import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Next resolves PostHog and next-intl together, with and without build credentials", () => {
  for (const [environment, credentials, bundler] of [
    ["production", true, "webpack"],
    ["production", false, "webpack"],
    ["production", true, "turbopack"],
    ["production", false, "turbopack"],
    ["development", true, "turbopack"],
  ] as const) {
    // Isolated imports reproduce Next's env-dependent config loading. Only inspect
    // bundler hooks: never run a compiler, upload maps, or use real credentials.
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--eval",
        `
          const assert = require('node:assert/strict');
          const { default: config } = require('./next.config.ts');
          const { normalizeConfig } = require('next/dist/server/config-shared.js');
          (async () => {
          const dev = process.env.NODE_ENV === 'development';
          const resolved = await normalizeConfig(dev ? 'phase-development-server' : 'phase-production-build', config);
          assert.equal(typeof resolved, 'object');
          assert.equal(resolved.distDir, dev ? '.next-dev' : '.next');
          assert.equal(resolved.images.remotePatterns.length, 4);
          assert.notEqual(resolved.cacheComponents, true);
          assert.notEqual(resolved.reactCompiler, true);
          assert.notEqual(resolved.typescript?.ignoreBuildErrors, true);
          if (${bundler === "webpack"}) {
            assert.equal(typeof resolved.webpack, 'function');
            const webpack = resolved.webpack({ context: process.cwd(), resolve: { alias: {} }, plugins: [] }, {});
            assert.ok(webpack.resolve.alias['next-intl/config'].endsWith('/i18n/request.ts'));
            assert.equal(webpack.plugins.length, ${environment === "production" && credentials ? 1 : 0});
          } else {
            assert.equal(resolved.turbopack.resolveAlias['next-intl/config'], './i18n/request.ts');
            if (${environment === "production" && credentials}) {
              assert.equal(typeof resolved.compiler.runAfterProductionCompile, 'function');
              assert.equal(resolved.productionBrowserSourceMaps, true);
            }
          }
          })();
        `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: environment,
          POSTHOG_API_KEY: credentials ? "audit-placeholder" : "",
          POSTHOG_PROJECT_ID: credentials ? "123" : "",
          NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
          WEBPACK: bundler === "webpack" ? "1" : undefined,
          TURBOPACK: bundler === "turbopack" ? "1" : undefined,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test("Next migration preserves production source-map bundling and replaces the removed lint command", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(manifest.dependencies.next.split(".")[0], "16");
  // pnpm 11 requires a newer Node than Next's own minimum (20.9).
  assert.equal(manifest.engines.node, ">=22.13.0");
  assert.equal(
    manifest.devDependencies["eslint-config-next"],
    manifest.dependencies.next,
  );
  assert.equal(manifest.scripts.build, "pnpm lint && next build --webpack");
  assert.match(manifest.scripts.lint, /^eslint /);
  assert.doesNotMatch(manifest.scripts.lint, /next lint/);
});

test("Next's new React diagnostics are not disabled globally", async () => {
  const { ESLint } = await import("eslint");
  const config = await new ESLint().calculateConfigForFile(
    "components/whiteboard/whiteboard-editor.tsx",
  );
  for (const rule of [
    "purity",
    "set-state-in-effect",
    "preserve-manual-memoization",
    "refs",
    "immutability",
    "incompatible-library",
  ]) {
    assert.notEqual(config.rules[`react-hooks/${rule}`][0], 0, rule);
  }
});
