import { defineConfig } from "unocss";
import { presetWind4, presetIcons, presetTypography } from "unocss";

export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons(),
    presetTypography({
      cssExtend: {
        p: {
          margin: "0.5rem 0",
        },
      },
    }),
  ],
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
  shortcuts: {
    btn: "rounded-md not-disabled:cursor-pointer w-fit flex gap-1 select-none justify-start items-center font-bold text-nowrap",

    "btn-none-rounded": "rounded-none",

    "btn-sm": "px-2.5 py-1.5 gap-1 text-sm",
    "btn-md": "px-3.5 py-2.5 gap-1",
    "btn-lg": "px-4 py-3 gap-2",

    "btn-w-full": "w-full",
    "btn-square": "w-10 h-10 gap-0 aspect-ratio-square",
    "btn-square-lg": "w-12 h-12 gap-0 aspect-ratio-square",
    "btn-square-sm": "w-8 h-8 gap-0 aspect-ratio-square",

    "btn-highlight": "text-highlight bg-base hover:bg-base-darker",
    "btn-base": "text-base-content bg-base hover:bg-base-darker",
    "btn-transparent": "text-black bg-transparent hover:bg-highlight-darkest",
    "btn-disabled":
      "bg-highlight-darkest text-highlight-content disabled:cursor-not-allowed",

    "btn-outline": "border-1 border-base-content",

    "btn-center": "justify-center",

    "btn-icon": "aspect-ratio-square",
    "btn-icon-sm": "w-4 h-4",
    "btn-icon-md": "w-6 h-6",
    "btn-icon-lg": "w-6 h-6",
  },
});
