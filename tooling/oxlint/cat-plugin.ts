import { eslintCompatPlugin } from "@oxlint/plugins";

import { noServerImport } from "./no-server-import.ts";

export default eslintCompatPlugin({
  meta: { name: "cat" },
  rules: {
    "no-server-import": noServerImport,
  },
});
