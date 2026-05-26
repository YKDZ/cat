declare module "@cat-plugin/*" {
  import type { CatPlugin } from "@cat/plugin-core";
  const plugin: CatPlugin;
  export default plugin;
}
