<script setup lang="ts">
import { computed, provide } from "vue";
import {
  _JSONSchemaSchema,
  type _JSONSchema,
  type NonNullJSONType,
} from "@cat/shared/schema/json";
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

const objectProperties = computed(() => {
  const properties = props.schema.properties;
  if (!properties) return [];

  return Object.keys(properties).map((key) => {
    return {
      key,
      schema: _JSONSchemaSchema.parse(properties[key]),
    };
  });
});

const handleUpdate = (
  to: NonNullJSONType,
  schema: _JSONSchema,
  key: string | number,
  path: (string | number)[],
) => {
  // 叶子节点
  // 递归的起点
  // 此时 key === props.propertyKey
  if (!isObject.value) emits("_update", to, schema, key, [key]);
  // 位于中间位置
  // 只可能是数组或对象的成员被更新了
  else {
    if (typeof key === "number") {
      const data = (props.data as Array<NonNullJSONType>) ?? [];
      data[key] = to;
      path.unshift(props.propertyKey);
      emits("_update", data, schema, props.propertyKey, path);
    } else if (typeof key === "string") {
      const data = (props.data as Record<string, NonNullJSONType>) ?? {};
      data[key] = to;
      path.unshift(props.propertyKey);
      emits("_update", data, schema, props.propertyKey, path);
    } else throw new Error("This should never happen");
  }
};

const matchedRenderer = computed<RendererComponent | null>(() => {
  const matcher = MatcherRegistry.match(props.schema);
  if (!matcher) return null;
  return matcher.renderer;
});

const dataOfPropertyKey = <T,>(key: string, fallback: T) => {
  if (!props.data || !Object.keys(props.data).includes(key)) return fallback;
  return (props.data as Record<string, NonNullJSONType>)[key] as T;
};

const providedData = computed(() => {
  const data = props.data ?? props.schema.default;
  return data;
});

const isObject = computed(() => {
  return props.schema.type === "object";
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
      @_update="(to) => handleUpdate(to, props.schema, propertyKey, [])"
    />
    <div v-if="isObject">
      <IJsonForm
        v-for="property in objectProperties"
        :key="property.key"
        :data="
          dataOfPropertyKey(
            property.key,
            property.schema.default,
          ) as NonNullJSONType
        "
        :property-key="property.key"
        :schema="property.schema"
        @_update="handleUpdate"
      />
    </div>
  </template>
</template>
