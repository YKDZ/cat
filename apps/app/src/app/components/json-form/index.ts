import type { Component, InjectionKey } from "vue";
import StringRenderer from "./renderers/StringRenderer.vue";
import NumberRenderer from "./renderers/NumberRenderer.vue";
import BooleanRenderer from "./renderers/BooleanRenderer.vue";
import EnumRenderer from "./renderers/EnumRenderer.vue";
import ConstRenderer from "./renderers/ConstRenderer.vue";
import ArrayRenderer from "./renderers/ArrayRenderer.vue";

export const schemaKey = Symbol() as InjectionKey<string>;

export type RendererMatcherContenxt = {
  schema: string;
};

export type Renderer = {
  renderer: Component;
  matcher: (ctx: RendererMatcherContenxt) => boolean;
};

export class RendererRegistry {
  public static renderers: Renderer[] = [];

  public static register(renderer: Renderer) {
    this.renderers.push(renderer);
  }
}

const renderers: Renderer[] = [
  {
    renderer: EnumRenderer,
    matcher: ({ schema }) => {
      return !!JSON.parse(schema).enum;
    },
  },
  {
    renderer: ConstRenderer,
    matcher: ({ schema }) => {
      return !!JSON.parse(schema).const;
    },
  },
  {
    renderer: StringRenderer,
    matcher: ({ schema }) => {
      return JSON.parse(schema).type === "string";
    },
  },
  {
    renderer: NumberRenderer,
    matcher: ({ schema }) => {
      return JSON.parse(schema).type === "number";
    },
  },
  {
    renderer: BooleanRenderer,
    matcher: ({ schema }) => {
      return JSON.parse(schema).type === "boolean";
    },
  },
  {
    renderer: ArrayRenderer,
    matcher: ({ schema }) => {
      return JSON.parse(schema).type === "array";
    },
  },
];

renderers.forEach((renderer) => RendererRegistry.register(renderer));

export const transferDataToString = (data: unknown) => {
  if (typeof data === "string") {
    return data;
  } else {
    return JSON.stringify(data);
  }
};
