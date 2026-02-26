import type { Config } from "vike/types";

import vikePhoton from "vike-photon/config";
import vikeVue from "vike-vue/config";

export default {
  passToClient: [
    "name",
    "user",
    "_piniaInitState",
    "pluginComponents",
    "i18nMessages",
    "baseURL",
  ],

  extends: [vikeVue, vikePhoton],

  filesystemRoutingRoot: "/",

  photon: {
    server: "../../server/index.ts",
  },
} as Config;
