<script setup lang="ts">
import { computed, provide } from "vue";
import type { _JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import { MatcherRegistry, type RendererComponent } from "./index.ts";
import { schemaKey } from "./utils.ts";

const props = defineProps<{
  propertyKey: string | number;
  schema: _JSONSchema;
  data: NonNullJSONType;
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

const providedData = computed(() => {
  return props.data ?? props.schema.default;
});

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
