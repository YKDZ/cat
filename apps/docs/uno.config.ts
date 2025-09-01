import { defineConfig, presetWind4, presetIcons } from "unocss";

export default defineConfig({
  presets: [presetWind4(), presetIcons()],
  theme: {
    colors: {
      "default-1": "var(--vp-c-default-1)",
      "default-2": "var(--vp-c-default-2)",
      "default-3": "var(--vp-c-default-3)",
      "default-soft": "var(--vp-c-default-soft)",

      "brand-1": "var(--vp-c-brand-1)",
      "brand-2": "var(--vp-c-brand-2)",
      "brand-3": "var(--vp-c-brand-3)",
      "brand-soft": "var(--vp-c-brand-soft)",

      "tip-1": "var(--vp-c-tip-1)",
      "tip-2": "var(--vp-c-tip-2)",
      "tip-3": "var(--vp-c-tip-3)",
      "tip-soft": "var(--vp-c-tip-soft)",

      "warning-1": "var(--vp-c-warning-1)",
      "warning-2": "var(--vp-c-warning-2)",
      "warning-3": "var(--vp-c-warning-3)",
      "warning-soft": "var(--vp-c-warning-soft)",

      "danger-1": "var(--vp-c-danger-1)",
      "danger-2": "var(--vp-c-danger-2)",
      "danger-3": "var(--vp-c-danger-3)",
      "danger-soft": "var(--vp-c-danger-soft)",

      bg: "var(--vp-c-bg)",
    },
  },
});
