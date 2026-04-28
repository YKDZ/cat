declare module "*.vue" {
  import type { DefineComponent } from "vue";
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<any, any, any>;
  export default component;
}
