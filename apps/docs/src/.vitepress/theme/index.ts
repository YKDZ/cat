import "./style.css";
import type { Theme } from "vitepress";

import DefaultTheme from "vitepress/theme";
import { h } from "vue";

import Mermaid from "./Mermaid.vue";

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {});
  },
  enhanceApp({ app }) {
    app.component("Mermaid", Mermaid);
  },
} satisfies Theme;
