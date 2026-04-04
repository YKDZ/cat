import { defineConfig } from "oxlint";

import rootConfig from "../../oxlint.config.ts";

export default defineConfig({
  extends: [rootConfig],
  overrides: [
    {
      files: ["**/*.{test,spec}.{ts,tsx}"],
      rules: {
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-explicit-any": "off",
      },
    },
  ],
});
