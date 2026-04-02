import { defineConfig } from "oxlint";

import rootConfig from "../../oxlint.config.ts";

export default defineConfig({
  extends: [rootConfig],
  rules: {
    // CLI tool — console output is the intended interface
    "eslint/no-console": "off",
  },
});
