import vikeVue from "vike-vue/config";
import type { Config } from "vike/types";

export default {
  passToClient: [
    "name",
    "user",
    "_piniaInitState",
    "pluginComponents",
    "i18nMessages",
    "baseURL",
    "displayLanguage",
    "isMobile",
  ],

  extends: [vikeVue],

  filesystemRoutingRoot: "/",

  prefetch: {
    staticAssets: "viewport",
    pageContext: false,
  },
} as Config;
