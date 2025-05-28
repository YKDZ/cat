import vikeVue from "vike-vue/config";
import type { Config } from "vike/types";
import vikeServer from "vike-server/config";
import Root from "../layouts/Root.vue";

export default {
  Layout: Root,

  title: "CAT",
  description: "Self-hosted CAT platform",

  passToClient: ["user", "_piniaInitState"],
  extends: [vikeVue, vikeServer],

  server: "src/server/index.ts",

  filesystemRoutingRoot: "/",
} as Config;
