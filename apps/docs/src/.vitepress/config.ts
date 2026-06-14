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

const developerSidebarItems = [
  { text: "Overview", link: "/developer/" },
  { text: "Plugin Lifecycle", link: "/developer/plugin-lifecycle" },
  { text: "VCS Branch Isolation", link: "/developer/vcs-branch-isolation" },
  { text: "Term Recall", link: "/developer/term-recall" },
  { text: "Memory Recall", link: "/developer/memory-recall" },
  { text: "Automatic Translation", link: "/developer/automatic-translation" },
  { text: "QA Review", link: "/developer/qa-review" },
  { text: "Agent Runtime", link: "/developer/agent-runtime" },
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
      { text: "Developer", link: "/developer/" },
      { text: "Plugin Lifecycle", link: "/developer/plugin-lifecycle" },
    ],

    sidebar: [
      {
        text: "Developer",
        items: developerSidebarItems,
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/vuejs/vitepress" },
    ],
  },
});
