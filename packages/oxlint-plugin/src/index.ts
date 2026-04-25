import { eslintCompatPlugin } from "@oxlint/plugins";

import { noServerImport } from "./rules/no-server-import.ts";
import { noSharedSubpathImport } from "./rules/no-shared-subpath-import.ts";

const plugin = eslintCompatPlugin({
  meta: { name: "cat" },
  rules: {
    "no-server-import": noServerImport,
    "no-shared-subpath-import": noSharedSubpathImport,
  },
});

export default plugin;
