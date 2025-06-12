<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { schemaKey } from "..";

const props = defineProps<{
  propertyKey?: string;
  data: number;
}>();

const emits = defineEmits<{
  (e: "_update", to: number): void;
}>();

const value = ref(props.data);
const schema = inject(schemaKey)!;

const handleUpdate = () => {
  emits("_update", value.value);
};

watch(
  () => props.data,
  (newData) => {
    value.value = newData;
  },
);
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      schema.title ?? propertyKey
    }}</label>
    <input
      v-model.number="value"
      type="number"
      class="text-highlight-content-darker px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-highlight-darkest ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-base"
      @change="handleUpdate"
    />
  </div>
</template>
