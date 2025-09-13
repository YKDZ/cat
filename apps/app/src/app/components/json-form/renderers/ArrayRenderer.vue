<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { schemaKey } from "..";
import JSONForm from "../JSONForm.vue";
import type { JSONSchema, JSONType } from "@cat/shared/schema/json";
import HButton from "@/app/components/headless/HButton.vue";
import z from "zod";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: JSONType): void;
}>();

const schema = inject(schemaKey)!;
const value = computed(() =>
  z.array(z.json()).parse(props.data ?? schema.default),
);
const count = ref(value.value.length);

const itemsSchema = computed<JSONSchema>(() => {
  // TODO Draft 2020-12 以后 items 不再能是数组
  // 确保返回的是单个 JSONSchema 对象，而不是数组
  const items = schema.items;
  if (Array.isArray(items)) {
    // 如果是数组，返回第一个元素或者创建一个通用的 schema
    return (items[0] as JSONSchema) || { type: "string" };
  }
  return items as JSONSchema;
});

const prefixItemsSchemas = computed(() => {
  return (schema.prefixItems ? schema.prefixItems : []) as JSONSchema[];
});

const handleUpdate = (to: JSONType, index: number) => {
  value.value.splice(index, 1, to);
  emits("_update", value.value);
};

const handleDelete = (index: number) => {
  count.value--;
  emits(
    "_update",
    value.value.filter((_, i) => i !== index),
  );
};
</script>

<template>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base btn-square',
    }"
    icon="i-mdi:plus"
    @click="count++"
  />
  <div v-for="index in count" :key="index">
    <HButton no-text icon="i-mdi:trash-can" @click="handleDelete(index - 1)" />
    <JSONForm
      :schema="
        index - 1 >= prefixItemsSchemas.length
          ? itemsSchema
          : prefixItemsSchemas[index - 1]
      "
      :data="value[index - 1]"
      :property-key
      @update="(to) => handleUpdate(to, index - 1)"
    />
  </div>
</template>
