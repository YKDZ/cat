<script setup lang="ts">
import { computed, provide } from "vue";
import {
  _JSONSchemaSchema,
  type _JSONSchema,
  type JSONType,
} from "@cat/shared/schema/json";
import { MatcherRegistry, schemaKey, type RendererComponent } from "./index.ts";

type LabelClasses = {
  label?: string;
  "label-title"?: string;
  "label-description"?: string;
};

const props = defineProps<{
  propertyKey?: string;
  schema: _JSONSchema;
  data: JSONType;
  classes?: LabelClasses;
}>();

const emits = defineEmits<{
  (e: "update", to: JSONType, schema: _JSONSchema, key?: string): void;
  (e: "_update", to: JSONType, schema: _JSONSchema, key: string): void;
}>();

const objectProperties = computed(() => {
  if (typeof props.schema === "boolean") return [];

  if (props.schema.type !== "object" || !props.schema.properties) return [];

  return Object.keys(props.schema.properties!).map((key) => {
    return {
      key,
      schema: _JSONSchemaSchema.parse(props.schema.properties![key]),
    };
  });
});

const labelClasses = computed(() => ({
  label: props.classes?.label,
  "label-title": props.classes?.["label-title"],
  "label-description": props.classes?.["label-description"],
}));

const handleUpdate = (to: JSONType, schema: _JSONSchema, key?: string) => {
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
  <template v-if="typeof schema === 'boolean'" />
  <template v-else>
    <component
      :is="matchedRenderer"
      v-if="matchedRenderer"
      :data="providedData"
      :property-key="propertyKey"
      @_update="(to) => handleUpdate(to, props.schema)" />
    <div v-if="schema.type === 'object'">
      <slot name="label" :propertyKey :schema :labelClasses>
        <h3 :class="labelClasses.label">
          <span :class="labelClasses['label-title']">
            {{ schema.title ?? propertyKey }}</span
          >
          <span :class="labelClasses['label-description']">
            {{ schema.description }}</span
          >
        </h3></slot
      >
      <form>
        <JSONForm
          v-for="property in objectProperties"
          :key="property.key"
          :data="dataOfPropertyKey(property.key, property.schema.default)"
          :property-key="property.key"
          :schema="property.schema"
          :classes
          @_update="handleUpdate"
        />
      </form></div
  ></template>
  <slot name="custom" :props :classes />
</template>
