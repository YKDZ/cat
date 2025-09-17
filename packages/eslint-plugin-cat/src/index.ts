import { plugin } from "./plugin.ts";

export default {
  plugins: { "@cat": plugin },
  rules: {
    "@cat/no-vue-provide-in-plus-page": "error",
  } as const,
};
