import type { Config } from "vike/types";
import Editor from "../../layouts/Editor.vue";

export default {
  Layout: Editor,
  ssr: false,
} satisfies Config;
