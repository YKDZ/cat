import type { Config } from "vike/types";

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

  extends: [vikeVue],

  filesystemRoutingRoot: "/",
} as Config;
