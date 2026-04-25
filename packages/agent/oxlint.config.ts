import { defineConfig } from "oxlint";

import rootConfig from "../../oxlint.config.ts";

export default defineConfig({
  extends: [rootConfig],

  jsPlugins: ["../../packages/oxlint-plugin/dist/index.js"],
});
