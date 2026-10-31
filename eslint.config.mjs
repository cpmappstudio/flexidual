import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import convexPlugin from "@convex-dev/eslint-plugin";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  ...convexPlugin.configs.recommended,
  { ignores: [".next-dev/**", ".agents/**"] },
];

export default eslintConfig;
