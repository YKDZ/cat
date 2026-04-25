import { eslintCompatPlugin } from "@oxlint/plugins";

import { noServerImport } from "./rules/no-server-import.ts";

const plugin = eslintCompatPlugin({
  meta: { name: "cat" },
  rules: {
    "no-server-import": noServerImport,
  },
});

export default plugin;
