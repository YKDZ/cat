import { defineConfig } from "oxfmt";

export default defineConfig({
  $schema: "./node_modules/oxfmt/configuration_schema.json",
  printWidth: 80,
  ignorePatterns: [
    "**/dist/**",
    "**/coverage/**",
    "**/drizzle/**",
    "**/migrations/**",
    "**/schema/generated/**",
    "**/schema/drizzle/**",
    "**/*.generated.ts",
    ".symbol-index.json",
  ],
  sortImports: {},
  sortPackageJson: {
    sortScripts: true,
  },
  sortTailwindcss: {
    stylesheet: "./apps/app/src/assets/style.css",
    functions: ["clsx", "cn"],
    preserveWhitespace: true,
  },
});
