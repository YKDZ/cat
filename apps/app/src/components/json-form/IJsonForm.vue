<script setup lang="ts">
import {
  getDefaultFromSchema,
  type _JSONSchema,
  type NonNullJSONType,
} from "@cat/shared";
import { computed, provide } from "vue";

import { MatcherRegistry, type RendererComponent } from "./index.ts";
import { schemaKey } from "./utils.ts";

const props = defineProps<{
  propertyKey: string | number;
  schema: _JSONSchema;
  data?: NonNullJSONType;
}>();

const emits = defineEmits<{
  (
    e: "_update",
    to: NonNullJSONType,
    schema: _JSONSchema,
    key: string | number,
    path: (string | number)[],
  ): void;
}>();

const matchedRenderer = computed<RendererComponent | null>(() => {
  const matcher = MatcherRegistry.match(props.schema);
  if (!matcher) return null;
  return matcher.renderer;
});

const fallbackDataForSchema = (schema: _JSONSchema): NonNullJSONType => {
  const schemaDefault = getDefaultFromSchema(schema);
  if (schemaDefault !== undefined && schemaDefault !== null) {
    return schemaDefault;
  }
  if (typeof schema === "boolean") return "";
  if (schema.type === "object" || schema.properties !== undefined) return {};
  if (schema.type === "array" || schema.items !== undefined) return [];
  if (schema.type === "boolean") return false;
  if (schema.type === "number" || schema.type === "integer") return 0;
  return "";
};

const providedData = computed<NonNullJSONType>(
  () => props.data ?? fallbackDataForSchema(props.schema),
);

provide(schemaKey, props.schema);
</script>

<template>
  <template v-if="typeof schema === 'boolean'" />
  <component
    :is="matchedRenderer"
    v-else-if="matchedRenderer"
    :data="providedData"
    :property-key="propertyKey"
    @_update="
      (to: NonNullJSONType) =>
        emits('_update', to, props.schema, props.propertyKey, [
          props.propertyKey,
        ])
    "
  />
</template>
