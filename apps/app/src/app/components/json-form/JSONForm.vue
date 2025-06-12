<script setup lang="ts">
import { computed, provide } from "vue";
import { RendererRegistry, schemaKey } from ".";
import type { JSONSchema } from "zod/v4/core";
import type { JSONType } from "@cat/shared";

const props = defineProps<{
  propertyKey?: string;
  schema: JSONSchema.JSONSchema;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "update", to: JSONType): void;
  (e: "_update", to: JSONType, key: string): void;
}>();

const objectProperties = computed(() => {
  if (props.schema.type !== "object" || !props.schema.properties) return [];

  return Object.keys(props.schema.properties!).map((key) => {
    return {
      key,
      schema: props.schema.properties![key] as JSONSchema.JSONSchema,
    };
  });
});

const handleUpdate = (to: JSONType, key?: string) => {
  let newData: JSONType;

  if (
    key &&
    !Array.isArray(to) &&
    typeof props.data === "object" &&
    !Array.isArray(props.data)
  ) {
    const obj = { ...props.data };
    obj[key] = to;
    newData = obj;
  } else {
    newData = to;
  }

  if (props.propertyKey) {
    emits("_update", newData, props.propertyKey);
  } else {
    emits("update", newData);
  }
};

const matchedRenderer = computed(() => {
  return (
    RendererRegistry.renderers.find(({ matcher }) => {
      return matcher({ schema: props.schema });
    })?.renderer ?? null
  );
});

provide(schemaKey, props.schema);
</script>

<template>
  <component
    :is="matchedRenderer"
    :data="props.data ?? schema.default"
    :property-key="propertyKey"
    @_update="handleUpdate"
  />
  <div v-if="props.schema.type === 'object'">
    <JSONForm
      v-for="property in objectProperties"
      :key="property.key"
      :data="(data as Record<string, JSONType>)[property.key]"
      :property-key="property.key"
      :schema="property.schema"
      @_update="handleUpdate"
    />
  </div>
</template>
