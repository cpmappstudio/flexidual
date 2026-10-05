import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Next resolves PostHog and next-intl together, with and without build credentials", () => {
  for (const [environment, credentials] of [
    ["production", true],
    ["production", false],
    ["development", true],
  ] as const) {
    // Isolated imports reproduce Next's env-dependent config loading. Only inspect
    // webpack hooks: never run a compiler, upload maps, or use real credentials.
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
          assert.equal(typeof resolved.webpack, 'function');
          const webpack = resolved.webpack({ context: process.cwd(), resolve: { alias: {} }, plugins: [] }, {});
          assert.ok(webpack.resolve.alias['next-intl/config'].endsWith('/i18n/request.ts'));
          assert.equal(webpack.plugins.length, ${environment === "production" && credentials ? 1 : 0});
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
        },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});
