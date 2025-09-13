<script setup lang="ts">
import { computed, inject, ref, shallowRef, watch } from "vue";
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
const value = shallowRef<JSONType[]>(
  z.array(z.json()).parse(props.data ?? schema.default),
);
const count = ref(value.value.length);
const skipNextUpdate = ref(false);

const itemsSchema = computed(() => {
  // TODO Draft 2020-12 以后 items 不再能是数组
  return schema.items as JSONSchema[];
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
  value.value = value.value.filter((_, i) => i !== index);
  emits("_update", value.value);
};

watch(
  () => props.data,
  (newData) => {
    skipNextUpdate.value = true;
    value.value = z.array(z.json()).parse(newData);
  },
);
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
        index > prefixItemsSchemas.length
          ? itemsSchema
          : prefixItemsSchemas[index]
      "
      :data="value[index - 1]"
      :property-key
      @update="(to) => handleUpdate(to, index - 1)"
    />
  </div>
</template>
