import { defineConfig } from "unocss";
import { presetWind4, presetIcons } from "unocss";

export default defineConfig({
  presets: [presetWind4(), presetIcons()],
  theme: {
    colors: {
      base: "#38C800",
      "base-darker": "#2DA000",
      highlight: "#FFFFFF",
      "highlight-darker": "#EDF2F7",
    },
  },
});
