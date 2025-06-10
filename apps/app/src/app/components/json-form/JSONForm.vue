<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { computed, provide } from "vue";
import { RendererRegistry, schemaKey } from ".";

const props = defineProps<{
  propertyKey?: string;
  schema: string;
  data: any;
}>();

const emits = defineEmits<{
  (e: "update", to: any): void;
  (e: "_update", to: any, key: string): void;
}>();

const jsonSchema = computed(() => {
  return JSON.parse(props.schema);
});

const type = computed(() => {
  return jsonSchema.value.type as string;
});

const objectProperties = computed(() => {
  if (jsonSchema.value.type !== "object")
    return [] as {
      key: string;
      schema: string;
    }[];
  return Object.keys(jsonSchema.value.properties).map((key) => {
    return {
      key,
      schema: JSON.stringify(jsonSchema.value.properties[key]),
    };
  });
});

const handleUpdate = (to: any, key?: string) => {
  let newData;

  if (key) {
    newData = {
      ...props.data,
    };
    newData[key] = to;
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
    RendererRegistry.renderers.find((renderer) => {
      return renderer.matcher({ schema: props.schema });
    })?.renderer ?? null
  );
});

provide(schemaKey, props.schema);
</script>

<template>
  <component
    :is="matchedRenderer"
    :data="props.data ?? jsonSchema.default"
    :property-key="propertyKey"
    @_update="handleUpdate"
  />
  <div v-if="type === 'object'">
    <JSONForm
      v-for="property in objectProperties"
      :key="property.key"
      :data="(data ?? {})[property.key]"
      :property-key="property.key"
      :schema="property.schema"
      @_update="handleUpdate"
    />
  </div>
</template>
