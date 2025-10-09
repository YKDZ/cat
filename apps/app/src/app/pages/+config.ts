import vikeVue from "vike-vue/config";
import type { Config } from "vike/types";
import vikeServer from "vike-server/config";

export default {
  passToClient: ["name", "user", "_piniaInitState", "i18nMessages"],
  extends: [vikeVue, vikeServer],

  server: {
    entry: "src/server/index.ts",
  },

  filesystemRoutingRoot: "/xxxxxx",
} as Config;
