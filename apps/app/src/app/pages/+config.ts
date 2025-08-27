import vikeVue from "vike-vue/config";
import type { Config } from "vike/types";
import vikeServer from "vike-server/config";
import Root from "@/app/layouts/Root.vue";

export default {
  Layout: Root,

  passToClient: ["name", "user", "_piniaInitState", "i18nMessages"],
  extends: [vikeVue, vikeServer],

  server: {
    entry: "src/server/index.ts",
  },

  filesystemRoutingRoot: "/",
} as Config;
