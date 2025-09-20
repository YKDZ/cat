import { defineConfig } from "unocss";
import {
  presetWind4,
  presetIcons,
  presetTypography,
  transformerVariantGroup,
} from "unocss";

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
  transformers: [transformerVariantGroup()],
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
  shortcuts: [
    {
      btn: "rounded-md not-disabled:cursor-pointer w-fit flex gap-1 select-none justify-start items-center font-bold text-nowrap",

      "btn-none-rounded": "rounded-none",

      "btn-sm": "px-2.5 py-1.5 gap-1 text-sm",
      "btn-md": "px-3.5 py-2.5 gap-1",
      "btn-lg": "px-4 py-3 gap-2",

      "btn-w-full": "w-full",
      "btn-square": "w-10 h-10 gap-0 aspect-ratio-square",
      "btn-square-lg": "w-12 h-12 gap-0 aspect-ratio-square",
      "btn-square-sm": "w-8 h-8 gap-0 aspect-ratio-square",

      "btn-transparent": "text-black bg-transparent hover:bg-highlight-darkest",
      "btn-disabled":
        "bg-highlight-darkest text-highlight-content disabled:cursor-not-allowed",

      "btn-outline": "border-1 border-base-content",

      "btn-center": "justify-center",

      "btn-icon": "aspect-ratio-square",
      "btn-icon-sm": "w-4 h-4",
      "btn-icon-md": "w-6 h-6",
      "btn-icon-lg": "w-6 h-6",

      toggle:
        "rounded-md relative inline-block transition-colors cursor-pointer",
      "toggle-md": "w-12 h-6",
      "toggle-thumb":
        "rounded-full absolute shadow-2xl transition-transform absolute top-0 left-0",
      "toggle-thumb-checked": "translate-x-120%",
      "toggle-thumb-md": "h-6 w-6",

      modal: "px-10 py-6 rounded-sm bg-highlight",
      "modal-backdrop":
        "bg-black bg-op-20 flex h-screen w-screen items-center left-0 top-0 justify-center fixed z-60",

      header:
        "px-4 py-1 bg-highlight flex min-h-16 w-full select-none items-center left-0 top-0 justify-between sticky z-10 md:px-6",

      input:
        "text-highlight-content-darker outline-0 bg-transparent w-full select-none disabled:cursor-not-allowed",
      "input-sm": "pr-2 h-8",
      "input-md": "pr-3 h-10",
      "input-container":
        "ring-1 flex gap-1 items-center focus-within:ring-base ring-highlight-darkest ring-offset-transparent ",
      "input-icon": "ml-2 text-lg",

      form: "flex flex-col gap-2",
      label: "flex flex-col",
      "label-text": "",
      "label-text-required":
        "after:text-error-darker after:ml-1 after:content-['*']",
    },
    [
      /^btn-(.*)$/,
      // @ts-expect-error Just type error
      ([, c], { theme: { colors } }) => {
        if (Object.keys(colors).includes(c))
          return `bg-${c} text-${c}-content hover:bg-${c}-darker`;
      },
    ],
    [
      /^toggle-(.*)$/,
      // @ts-expect-error Just type error
      ([, c], { theme: { colors } }) => {
        if (Object.keys(colors).includes(c)) return `bg-${c}`;
      },
    ],
    [
      /^toggle-thumb-(.*)$/,
      // @ts-expect-error Just type error
      ([, c], { theme: { colors } }) => {
        if (Object.keys(colors).includes(c)) return `bg-${c}`;
      },
    ],
  ],
});
