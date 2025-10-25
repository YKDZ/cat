import "./style.css";
import { h } from "vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import Mermaid from "./Mermaid.vue";

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {});
  },
  enhanceApp({ app, _router, _siteData }) {
    app.component("Mermaid", Mermaid);
  },
} satisfies Theme;
