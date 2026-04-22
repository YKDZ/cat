import type { MarkdownOptions } from "vitepress";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitepress";

import { sections } from "../../../../autodoc.config";
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

// Build AutoDoc sidebar from sections.config.ts — top-level curation stays manual,
// but the AutoDoc topic entries now point at generated section indexes.
const autodocSidebarItems = [
  { text: "Overview", link: "/autodoc/overview" },
  ...sections
    .filter((s) => s.public)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      text: `${s.title.zh} / ${s.title.en}`,
      link: `/autodoc/${s.id}/index`,
    })),
  // Compat: keep package reference pages accessible
  {
    text: "Package Reference",
    collapsed: true,
    items: [
      { text: "@cat/domain", link: "/autodoc/packages/domain" },
      { text: "@cat/operations", link: "/autodoc/packages/operations" },
      { text: "@cat/shared", link: "/autodoc/packages/shared" },
      { text: "@cat/db", link: "/autodoc/packages/db" },
      { text: "@cat/permissions", link: "/autodoc/packages/permissions" },
      { text: "@cat/workflow", link: "/autodoc/packages/workflow" },
      { text: "@cat/auth", link: "/autodoc/packages/auth" },
      { text: "@cat/core", link: "/autodoc/packages/core" },
      { text: "@cat/server-shared", link: "/autodoc/packages/server-shared" },
      { text: "@cat/plugin-core", link: "/autodoc/packages/plugin-core" },
      { text: "@cat/message", link: "/autodoc/packages/message" },
      { text: "@cat/graph", link: "/autodoc/packages/graph" },
      { text: "@cat/agent", link: "/autodoc/packages/agent" },
      { text: "@cat/agent-tools", link: "/autodoc/packages/agent-tools" },
      { text: "@cat/vcs", link: "/autodoc/packages/vcs" },
    ],
  },
];

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
        items: autodocSidebarItems,
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
