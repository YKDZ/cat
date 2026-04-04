import type { MarkdownOptions } from "vitepress";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitepress";

import MermaidExample from "./mermaid-markdown-all.js";

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
    // @ts-expect-error vite version error
    plugins: [tailwindcss()],
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
    nav: [
      { text: "Developer", link: "/developer/future" },
      { text: "User", link: "/user/intro" },
      { text: "AutoDoc", link: "/autodoc/overview" },
    ],

    sidebar: [
      {
        text: "Developer",
        items: [
          { text: "Future", link: "/developer/future" },
          { text: "Recall Architecture", link: "/developer/recall" },
        ],
      },
      {
        text: "AutoDoc",
        items: [
          { text: "Overview", link: "/autodoc/overview" },
          { text: "@cat/domain", link: "/autodoc/packages/domain" },
          { text: "@cat/operations", link: "/autodoc/packages/operations" },
          { text: "@cat/shared", link: "/autodoc/packages/shared" },
          { text: "@cat/db", link: "/autodoc/packages/db" },
          {
            text: "@cat/permissions",
            link: "/autodoc/packages/permissions",
          },
          { text: "@cat/workflow", link: "/autodoc/packages/workflow" },
        ],
      },
      {
        text: "User",
        items: [{ text: "Intro", link: "/user/intro" }],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/vuejs/vitepress" },
    ],
  },
});
