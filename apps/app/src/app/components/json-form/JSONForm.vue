<script setup lang="ts">
import { computed, provide } from "vue";
import { MatcherRegistry, schemaKey, type RendererComponent } from ".";
import {
  JSONSchemaSchema,
  type JSONSchema,
  type JSONType,
} from "@cat/shared/schema/json";

const props = defineProps<{
  propertyKey?: string;
  schema: JSONSchema;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "update", to: JSONType, schema: JSONSchema, key?: string): void;
  (e: "_update", to: JSONType, schema: JSONSchema, key: string): void;
}>();

const objectProperties = computed(() => {
  if (props.schema.type !== "object" || !props.schema.properties) return [];

  return Object.keys(props.schema.properties!).map((key) => {
    return {
      key,
      schema: JSONSchemaSchema.parse(props.schema.properties![key]),
    };
  });
});

const handleUpdate = (to: JSONType, schema: JSONSchema, key?: string) => {
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

  // 有 propertyKey 代表未达到最顶层 JSONForm
  if (props.propertyKey) {
    emits("_update", newData, schema, props.propertyKey);
  } else {
    emits("update", newData, schema, key);
  }
};

const matchedRenderer = computed<RendererComponent | null>(() => {
  const matcher = MatcherRegistry.match(props.schema);
  if (!matcher) return null;
  return matcher.renderer;
});

const dataOfPropertyKey = <T,>(key: string, fallback: T) => {
  if (!props.data || !Object.keys(props.data as object).includes(key))
    return fallback;
  return (props.data as Record<string, JSONType>)[key] as T;
};

const providedData = computed(() => {
  const data = props.data ?? props.schema.default;
  return data;
});

provide(schemaKey, props.schema);
</script>

<template>
  <component
    :is="matchedRenderer"
    v-if="matchedRenderer"
    :data="providedData"
    :property-key="propertyKey"
    @_update="(to) => handleUpdate(to, props.schema)"
  />
  <div v-if="props.schema.type === 'object'">
    <label class="flex flex-col gap-0.5">
      <span class="text-lg text-highlight-content-darker font-bold">
        {{ schema.title ?? propertyKey }}</span
      >
      <span class="text-sm text-highlight-content">
        {{ schema.description }}</span
      >
    </label>
    <form>
      <JSONForm
        v-for="property in objectProperties"
        :key="property.key"
        :data="dataOfPropertyKey(property.key, property.schema.default)"
        :property-key="property.key"
        :schema="property.schema"
        @_update="handleUpdate"
      />
    </form>
  </div>
</template>
