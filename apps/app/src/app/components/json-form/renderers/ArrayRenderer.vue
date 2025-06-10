<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { schemaKey } from "..";
import JSONForm from "../JSONForm.vue";
import Button from "../../Button.vue";

const props = defineProps<{
  propertyKey?: string;
  data: unknown[];
}>();

const emits = defineEmits<{
  (e: "_update", to: unknown[]): void;
}>();

const schema = inject(schemaKey);
const count = ref(props.data.length);

const jsonSchema = computed(() => {
  return JSON.parse(schema!);
});

const value = ref(props.data ?? jsonSchema.value.defaults);

const itemsSchema = computed(() => {
  return JSON.stringify(jsonSchema.value.items);
});

const prefixItemsSchemas = computed(() => {
  return (
    jsonSchema.value.prefixItems
      ? (jsonSchema.value.prefixItems as unknown[])
      : []
  ).map((schema) => JSON.stringify(schema));
});

const handleUpdate = (to: unknown, index: number) => {
  value.value.splice(index, 1, to);
  emits("_update", value.value);
};

const handleDelete = (index: number) => {
  count.value--;
  value.value = value.value.filter((_, i) => i !== index);
  emits("_update", value.value);
};
</script>

<template>
  <Button no-text icon="i-mdi:plus" @click="count++" />
  <div v-for="index in count" :key="index">
    <Button no-text icon="i-mdi:trash-can" @click="handleDelete(index - 1)" />
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
