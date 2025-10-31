import vikeVue from "vike-vue/config";
import type { Config } from "vike/types";
import vikePhoton from "vike-photon/config";

export default {
  passToClient: ["name", "user", "_piniaInitState", "i18nMessages"],
  extends: [vikeVue, vikePhoton],

  photon: {
    server: "src/server/index.ts",
  },

  filesystemRoutingRoot: "/",
} as Config;
