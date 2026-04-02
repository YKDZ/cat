import { defineConfig } from "oxfmt";

export default defineConfig({
  $schema: "./node_modules/oxfmt/configuration_schema.json",
  printWidth: 80,
  ignorePatterns: [
    "**/dist",
    "packages/shared/src/schema/drizzle",
    "apps/docs/src/autodoc",
  ],
  sortImports: {
    groups: [
      "type-import",
      ["value-builtin", "value-external"],
      "type-internal",
      "value-internal",
      ["type-parent", "type-sibling", "type-index"],
      ["value-parent", "value-sibling", "value-index"],
      "unknown",
    ],
  },
  sortTailwindcss: {
    stylesheet: "./apps/app/src/app/assets/style.css",
    functions: ["clsx", "cn"],
    preserveWhitespace: true,
  },
  sortPackageJson: {
    sortScripts: true,
  },
});
