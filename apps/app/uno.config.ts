import { defineConfig } from "unocss";
import { presetWind4, presetIcons } from "unocss";

export default defineConfig({
  presets: [presetWind4(), presetIcons()],
  theme: {
    colors: {
      base: "var(--cat-theme-base)",
      "base-darker": "var(--cat-theme-base-darker)",
      "base-darkest": "var(--cat-theme-base-darkest)",
      "base-content": "var(--cat-theme-base-content)",
      "base-content-darker": "var(--cat-theme-base-content-darker)",
      highlight: "var(--cat-theme-highlight)",
      "highlight-darker": "var(--cat-theme-highlight-darker)",
      "highlight-darkest": "var(--cat-theme-highlight-darkest)",
      "highlight-content": "var(--cat-theme-highlight-content)",
      "highlight-content-darker": "var(--cat-theme-highlight-content-darker)",
    },
  },
});
