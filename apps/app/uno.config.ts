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
      warning: "var(--cat-theme-warning)",
      "warning-darker": "var(--cat-theme-warning-darker)",
      "warning-darkest": "var(--cat-theme-warning-darkest)",
      "warning-content": "var(--cat-theme-warning-content)",
      error: "var(--cat-theme-error)",
      "error-darker": "var(--cat-theme-error-darker)",
      "error-darkest": "var(--cat-theme-error-darkest)",
      "error-content": "var(--cat-theme-error-content)",
      success: "var(--cat-theme-success)",
      "success-darker": "var(--cat-theme-success-darker)",
      "success-darkest": "var(--cat-theme-success-darkest)",
      "success-content": "var(--cat-theme-success-content)",
      info: "var(--cat-theme-info)",
      "info-darker": "var(--cat-theme-info-darker)",
      "info-darkest": "var(--cat-theme-info-darkest)",
      "info-content": "var(--cat-theme-info-content)",
    },
  },
});
