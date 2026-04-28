import { defineConfig } from "oxlint";

import rootConfig from "../../oxlint.config.ts";

export default defineConfig({
  extends: [rootConfig],
  rules: {
    "eslint/no-console": "off",
    "eslint/require-yield": "off",
    "eslint/no-await-in-loop": "off",
    "eslint/no-unused-vars": "off",
    "eslint/no-empty-function": "off",
    "eslint/no-plusplus": "off",
    "typescript/no-explicit-any": "off",
  },
});
