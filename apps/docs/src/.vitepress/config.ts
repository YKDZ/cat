import { defineConfig } from "vitepress";
import MermaidExample from "./mermaid-markdown-all.js";
import type { MarkdownOptions } from "vitepress";
import UnoCSS from "unocss/vite";

const allMarkdownTransformers: MarkdownOptions = {
  theme: {
    light: "github-light",
    dark: "github-dark",
  },

  config: (md) => {
    MermaidExample(md);
  },
};

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "CAT Doc",
  description: "Official doc for CAT",

  outDir: "../dist/",
  cacheDir: "../.cache/",

  markdown: allMarkdownTransformers,

  vite: {
    plugins: [
      // @ts-expect-error UnoCSS Plugin types are not compatible with Vite 7 yet
      UnoCSS(),
    ],
  },

  head: [
    ["meta", { property: "og:title", content: "Mermaid" }],
    ["meta", { property: "og:url", content: "https://mermaid.js.org" }],
    [
      "meta",
      {
        property: "og:image",
        content: "https://mermaid.js.org/mermaid-logo-horizontal.svg",
      },
    ],
    [
      "script",
      {
        defer: "true",
        "data-domain": "mermaid.js.org",
        // All tracked stats are public and available at https://p.mermaid.live/mermaid.js.org
        src: "https://p.mermaid.live/js/script.tagged-events.outbound-links.js",
      },
    ],
  ],

  themeConfig: {
    nav: [{ text: "Developer", link: "/developer/" }],

    sidebar: [
      {
        text: "Developer",
        items: [
          { text: "Overview", link: "/developer/" },
          { text: "ER", link: "/developer/db-er" },
          { text: "Plugin System", link: "/developer/plugin-system" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/vuejs/vitepress" },
    ],
  },
});
