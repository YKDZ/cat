<script setup lang="ts">
import { computed, inject, ref, watch, onMounted } from "vue";
import { schemaKey, transferDataToString } from "..";
import type { JSONType } from "@cat/shared";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: string): void;
}>();

const schema = inject(schemaKey)!;

const value = ref(
  transferDataToString(props.data) ?? transferDataToString(schema.default),
);

const inputType = computed(() => {
  if (schema.format === "email") return "email";
  else return "text";
});

const handleUpdate = () => {
  emits("_update", value.value);
};

watch(
  () => props.data,
  (newData) => {
    value.value = transferDataToString(newData);
  },
  { deep: true },
);
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      schema.title ?? propertyKey
    }}</label>
    <input
      v-model="value"
      :type="inputType"
      class="text-highlight-content-darker px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-highlight-darkest ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-base"
      @input="handleUpdate"
    />
  </div>
</template>
