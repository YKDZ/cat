import type { Component, InjectionKey } from "vue";
import StringRenderer from "./renderers/StringRenderer.vue";
import NumberRenderer from "./renderers/NumberRenderer.vue";
import BooleanRenderer from "./renderers/BooleanRenderer.vue";
import EnumRenderer from "./renderers/EnumRenderer.vue";
import ConstRenderer from "./renderers/ConstRenderer.vue";
import ArrayRenderer from "./renderers/ArrayRenderer.vue";
import SecretRenderer from "./renderers/SecretRenderer.vue";
import { JSONSchema } from "@cat/shared";

export const schemaKey = Symbol() as InjectionKey<JSONSchema>;

export type RendererMatcherContext = {
  schema: any;
};

export type Renderer = {
  renderer: Component;
  matcher: (ctx: RendererMatcherContext) => boolean;
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
      return !!schema["enum"];
    },
  },
  {
    renderer: ConstRenderer,
    matcher: ({ schema }) => {
      return !!schema.const;
    },
  },
  {
    renderer: SecretRenderer,
    matcher: ({ schema }) => {
      return schema["x-secret"] === true && schema.type === "string";
    },
  },
  {
    renderer: StringRenderer,
    matcher: ({ schema }) => {
      return schema.type === "string";
    },
  },
  {
    renderer: NumberRenderer,
    matcher: ({ schema }) => {
      return schema.type === "number";
    },
  },
  {
    renderer: BooleanRenderer,
    matcher: ({ schema }) => {
      return schema.type === "boolean";
    },
  },
  {
    renderer: ArrayRenderer,
    matcher: ({ schema }) => {
      return schema.type === "array";
    },
  },
];

renderers.forEach((renderer) => RendererRegistry.register(renderer));

export const transferDataToString = (data: unknown): string => {
  if (typeof data === "string") {
    return data;
  } else {
    return JSON.stringify(data);
  }
};
