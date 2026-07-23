import { spawnSync } from "child_process";
import fs from "fs";
import { config as loadEnvFile } from "dotenv";

const config = { ...process.env };

if (fs.existsSync(".env.local")) {
  loadEnvFile({ path: ".env.local", processEnv: config, quiet: true });
}

const email = process.argv[2];
const locale = process.argv[3] === "es" ? "es" : "en";
const baseUrl =
  config.APP_BASE_URL ||
  config.NEXT_PUBLIC_ROOT_DOMAIN ||
  "http://localhost:3000";

if (!email) {
  console.error("Usage: pnpm bootstrap:superadmin <email> [en|es]");
  process.exit(1);
}

if (config.CONVEX_DEPLOYMENT && !config.CONVEX_DEPLOYMENT.startsWith("dev:")) {
  console.error(
    "Refusing to run bootstrap against a non-dev Convex deployment.",
  );
  process.exit(1);
}

function runConvex(args) {
  return spawnSync("pnpm", ["exec", "convex", ...args], { stdio: "inherit" });
}

const enableBootstrapResult = runConvex([
  "env",
  "set",
  "ENABLE_DEV_BOOTSTRAP",
  "true",
]);

if (enableBootstrapResult.status !== 0) {
  process.exit(enableBootstrapResult.status ?? 1);
}

const result = runConvex([
  "run",
  "devBootstrap:createPlatformSuperadminInviteForDev",
  JSON.stringify({ email, locale, baseUrl }),
]);

process.exit(result.status ?? 1);
