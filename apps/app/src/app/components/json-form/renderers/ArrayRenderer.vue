<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { schemaKey } from "..";
import JSONForm from "../JSONForm.vue";
import Button from "../../Button.vue";

const props = defineProps<{
  data: any[];
}>();

const emits = defineEmits<{
  (e: "_update", to: any[]): void;
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

const handleUpdate = (to: any, index: number) => {
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
      :schema="itemsSchema"
      :data="value[index - 1]"
      @update="(to) => handleUpdate(to, index - 1)"
    />
  </div>
</template>
